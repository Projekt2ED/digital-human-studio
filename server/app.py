import os
import sys
import uuid
import json
import csv
import subprocess
import tempfile
from pathlib import Path
from io import BytesIO
from flask import Flask, request, jsonify, send_file, make_response

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'outputs')
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

SKILL_ROOT = os.getenv(
    'JY_SKILL_ROOT',
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.trae', 'skills', 'jianying-editor')),
)
JY_WRAPPER = os.path.join(SKILL_ROOT, 'scripts', 'jy_wrapper.py')
DATA_DIR = os.path.join(SKILL_ROOT, 'data')

VOXCPM_MODEL_PATH = os.getenv('VOXCPM_MODEL_PATH', r'E:\VoxCPM\pretrained_models\VoxCPM2')
VOXCPM_CLI = os.getenv('VOXCPM_CLI', 'voxcpm')

app = Flask(__name__)

# ===================== 工具函数 =====================

def _read_csv_column(filename, col_name):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    results = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            val = row.get(col_name, '').strip()
            if val and val not in results:
                results.append(val)
    return results


def _text_to_srt(text, total_duration=10.0):
    """将文案按句拆分生成 SRT 字幕"""
    import re
    sentences = re.split(r'[。！？；\n]', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        return ''

    interval = total_duration / len(sentences)
    srt_lines = []
    for i, s in enumerate(sentences):
        start = i * interval
        end = (i + 1) * interval
        srt_lines.append(str(i + 1))
        srt_lines.append(
            f'{_format_srt_time(start)} --> {_format_srt_time(end)}'
        )
        srt_lines.append(s)
        srt_lines.append('')
    return '\n'.join(srt_lines)


def _format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


# ===================== 文案仿写 =====================

STYLE_PROMPTS = {
    'casual': '请用自然口语化的风格改写以下文案，保持核心信息不变，让表达更轻松自然，适合短视频口播：',
    'professional': '请用专业严谨的风格改写以下文案，逻辑清晰、用词准确，适合知识类/商务类口播：',
    'humorous': '请用幽默风趣的风格改写以下文案，加入适当的梗和趣味表达，让观众会心一笑：',
    'suspense': '请用悬念钩子的风格改写以下文案，开头设置强力悬念吸引停留，中间逐步揭开：',
    'recommend': '请用种草安利的风格改写以下文案，突出产品/服务的亮点和体验感，激发购买欲：',
}

LENGTH_GUIDES = {
    'short': '控制在100-200字，适合15-30秒短视频。',
    'medium': '控制在200-500字，适合1-3分钟中视频。',
    'long': '控制在500-1000字，适合5-10分钟长视频。',
}


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'voxcpm_model': os.path.exists(VOXCPM_MODEL_PATH),
        'jy_skill': os.path.exists(JY_WRAPPER),
    })


@app.route('/api/script/rewrite', methods=['POST'])
def script_rewrite():
    data = request.json or {}
    text = data.get('text', '').strip()
    style = data.get('style', 'casual')
    length = data.get('length', 'medium')
    creativity = data.get('creativity', 0.7)
    add_hook = data.get('add_hook', False)
    input_type = data.get('input_type', 'text')

    if not text:
        return jsonify({'error': '请提供原始文案'}), 400

    style_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS['casual'])
    length_guide = LENGTH_GUIDES.get(length, LENGTH_GUIDES['medium'])

    system_msg = '你是一位专业的短视频文案写手，擅长各种风格的口播文案创作。'
    user_parts = [style_prompt, length_guide]

    if input_type == 'url':
        user_parts.insert(0, '用户提供了一个视频链接，请根据该链接的内容方向，发挥创意生成一段合适的中文口播文案。')

    user_parts.append(
        f'创意度：{"高" if creativity > 0.7 else "中" if creativity > 0.4 else "低"}（高=大胆改写，低=贴近原文）'
    )
    if add_hook:
        user_parts.append('要求：开头必须加入黄金三秒钩子，用悬念/反问/冲突抓住观众注意力。')

    user_parts.append(f'\n原文/链接：\n{text}')

    api_key = os.getenv('LLM_API_KEY', '')
    api_base = os.getenv('LLM_API_BASE', 'https://api.openai.com/v1')
    model = os.getenv('LLM_MODEL', 'gpt-3.5-turbo')

    if api_key:
        try:
            import requests as http_req
            resp = http_req.post(
                f'{api_base}/chat/completions',
                headers={'Authorization': f'Bearer {api_key}'},
                json={
                    'model': model,
                    'messages': [
                        {'role': 'system', 'content': system_msg},
                        {'role': 'user', 'content': '\n'.join(user_parts)},
                    ],
                    'temperature': 0.5 + creativity * 0.5,
                },
                timeout=60,
            )
            resp.raise_for_status()
            result = resp.json()['choices'][0]['message']['content']
            return jsonify({'result': result})
        except Exception as e:
            return jsonify({'error': f'LLM API 调用失败: {e}'}), 500
    else:
        demo = (
            f'[Demo模式 - 请配置 LLM_API_KEY 环境变量]\n\n'
            f'风格: {style} | 长度: {length}\n\n'
            f'这是一段示范仿写文案，用于展示流水线效果。\n\n'
            f'模仿原文的核心内容，用{STYLE_PROMPTS.get(style, "").split("：")[0]}的口吻重新表达。'
            f'加入自然的开场引导，让口播更流畅。\n\n'
            f'[完成配置后，可生成真实仿写结果]'
        )
        return jsonify({'result': demo})


# ===================== 声音克隆 =====================

@app.route('/api/voice/upload', methods=['POST'])
def voice_upload():
    if 'audio' not in request.files:
        return jsonify({'error': '未找到音频文件'}), 400
    f = request.files['audio']
    ext = os.path.splitext(f.filename)[1] or '.wav'
    save_name = f'{uuid.uuid4().hex}{ext}'
    save_path = os.path.join(UPLOAD_DIR, save_name)
    f.save(save_path)
    return jsonify({'path': save_path})


@app.route('/api/voice/generate', methods=['POST'])
def voice_generate():
    data = request.json or {}
    text = data.get('text', '').strip()
    mode = data.get('mode', 'controlled')
    cfg_value = data.get('cfg_value', 2.0)
    inference_steps = data.get('inference_steps', 10)
    normalize = data.get('normalize', True)
    denoise = data.get('denoise', True)

    if not text:
        return jsonify({'error': '请提供要合成的文本'}), 400

    output_name = f'{uuid.uuid4().hex}'
    output_path = os.path.join(OUTPUT_DIR, f'{output_name}.wav')
    srt_path = os.path.join(OUTPUT_DIR, f'{output_name}.srt')

    text_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
    text_file.write(text)
    text_file.close()

    try:
        cmd = [sys.executable, '-m', 'voxcpm', 'clone']

        ref_audio = data.get('reference_audio', '')
        if mode == 'controlled':
            if not ref_audio or not os.path.exists(ref_audio):
                return jsonify({'error': '参考音频文件不存在'}), 400
            cmd.extend(['--reference-audio', ref_audio])
        else:
            prompt_audio = data.get('prompt_audio', '')
            prompt_text = data.get('prompt_text', '')
            if not prompt_audio or not os.path.exists(prompt_audio):
                return jsonify({'error': '提示音频文件不存在'}), 400
            if not prompt_text:
                return jsonify({'error': '极致克隆模式需要提示文本'}), 400
            cmd.extend([
                '--prompt-audio', prompt_audio,
                '--prompt-text', prompt_text,
            ])

        cmd.extend([
            '--text', text,
            '--output', output_path,
            '--model-path', VOXCPM_MODEL_PATH,
            '--cfg-value', str(cfg_value),
            '--inference-timesteps', str(inference_steps),
        ])

        if normalize:
            cmd.append('--normalize')
        if denoise:
            cmd.append('--denoise')

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            return jsonify({'error': f'VoxCPM 执行失败: {result.stderr[:500]}'}), 500

        if not os.path.exists(output_path):
            return jsonify({'error': '音频文件未生成'}), 500

        # 估算音频时长并生成 SRT
        import soundfile as sf
        audio_info = sf.info(output_path)
        duration = audio_info.duration
        srt_content = _text_to_srt(text, duration)
        with open(srt_path, 'w', encoding='utf-8') as f:
            f.write(srt_content)

        response = make_response(send_file(output_path, mimetype='audio/wav'))
        response.headers['X-Audio-Local-Path'] = output_path
        response.headers['X-Srt-Local-Path'] = srt_path
        response.headers['X-Audio-Duration'] = str(round(duration, 2))
        return response
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'VoxCPM 执行超时（5分钟）'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        os.unlink(text_file.name)


# ===================== 一键成片 =====================

@app.route('/api/edit/upload', methods=['POST'])
def edit_upload():
    if 'file' not in request.files:
        return jsonify({'error': '未找到文件'}), 400
    f = request.files['file']
    ext = os.path.splitext(f.filename)[1]
    save_name = f'{uuid.uuid4().hex}{ext}'
    save_path = os.path.join(UPLOAD_DIR, save_name)
    f.save(save_path)
    return jsonify({'path': save_path})


@app.route('/api/edit/assets/bgm', methods=['GET'])
def edit_assets_bgm():
    styles = _read_csv_column('cloud_music_library.csv', 'style')
    if not styles:
        styles = ['科技', '温暖', '节奏', '古风', '轻柔']
    items = [{'name': s, 'style': s} for s in styles[:20]]
    return jsonify({'list': items})


@app.route('/api/edit/create-draft', methods=['POST'])
def edit_create_draft():
    data = request.json or {}
    project_name = data.get('project_name', '未命名项目')
    video_path = data.get('video_path', '')
    audio_path = data.get('audio_path', '')
    audio_blob = data.get('audio_blob', '')
    script_text = data.get('script_text', '')
    bgm_style = data.get('bgm_style', '科技')
    bgm_volume = data.get('bgm_volume', 30)
    add_title = data.get('add_title', True)
    title_text = data.get('title_text', project_name)
    resolution = data.get('resolution', 1080)
    fps = data.get('fps', 30)

    width_map = {720: 1280, 1080: 1920, 2160: 3840}
    height_map = {720: 720, 1080: 1080, 2160: 2160}

    # 处理音频：如果传了 blob URL，先下载保存
    real_audio_path = audio_path
    if not real_audio_path and audio_blob:
        # blob URL 无法直接服务端用；这里说明前端需要上传真实路径。
        # 我们在 voice generate 时已经把路径存到 X-Audio-Local-Path
        # 前端应把该路径通过 audio_path 传入
        pass

    script_lines = [
        'import os, sys',
        f'skill_root = {repr(SKILL_ROOT)}',
        'if not os.path.exists(os.path.join(skill_root, "scripts", "jy_wrapper.py")):',
        '    raise ImportError("Could not find jianying-editor skill root.")',
        'sys.path.insert(0, os.path.join(skill_root, "scripts"))',
        'from jy_wrapper import JyProject',
        '',
        f'project = JyProject({repr(project_name)}, canvas_width={width_map.get(resolution, 1920)}, canvas_height={height_map.get(resolution, 1080)}, fps={fps})',
        '',
    ]

    if video_path and os.path.exists(video_path):
        script_lines.append(f'project.add_media_safe({repr(video_path)}, "0s")')

    if real_audio_path and os.path.exists(real_audio_path):
        script_lines.append(f'project.add_media_safe({repr(real_audio_path)}, "0s", track_name="Audio")')

    if bgm_style:
        bgm_csv = os.path.join(DATA_DIR, 'cloud_music_library.csv')
        if os.path.exists(bgm_csv):
            with open(bgm_csv, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if bgm_style in row.get('style', ''):
                        bgm_url = row.get('url', '') or row.get('resource_id', '')
                        if bgm_url:
                            script_lines.append(f'project.add_cloud_music({repr(bgm_url)}, "0s", track_name="BGM")')
                            break

    if add_title and title_text:
        script_lines.append(f'project.add_text_simple({repr(title_text)}, start_time="0.5s", duration="3s", anim_in="复古打字机")')

    # 字幕：优先从 SRT 导入，否则从文案生成
    if script_text:
        srt_path = os.path.join(OUTPUT_DIR, f'sub_{uuid.uuid4().hex[:8]}.srt')
        srt_content = _text_to_srt(script_text)
        with open(srt_path, 'w', encoding='utf-8') as f:
            f.write(srt_content)
        if os.path.exists(srt_path):
            script_lines.append(f'project.draft.script_file.add_srt_from_file({repr(srt_path)})')

    script_lines.append('project.save()')
    script_lines.append(f'print("Draft created: " + project.draft_name)')

    script_content = '\n'.join(script_lines)
    script_path = os.path.join(OUTPUT_DIR, f'auto_edit_{uuid.uuid4().hex[:8]}.py')
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script_content)

    try:
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return jsonify({'error': f'草稿创建失败: {result.stderr[:500]}'}), 500
        return jsonify({'status': 'ok', 'message': '草稿创建成功', 'output': result.stdout.strip()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/edit/export', methods=['POST'])
def edit_export():
    data = request.json or {}
    project_name = data.get('project_name', '')
    resolution = data.get('resolution', 1080)
    fps = data.get('fps', 30)

    if not project_name:
        return jsonify({'error': '请提供项目名称'}), 400

    output_name = f'{uuid.uuid4().hex}.mp4'
    output_path = os.path.join(OUTPUT_DIR, output_name)

    try:
        cmd = [
            sys.executable,
            os.path.join(SKILL_ROOT, 'scripts', 'auto_exporter.py'),
            project_name,
            output_path,
            '--res', str(resolution),
            '--fps', str(fps),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            return jsonify({'error': f'导出失败: {result.stderr[:500]}'}), 500

        if not os.path.exists(output_path):
            return jsonify({'error': '导出文件未生成，请确保剪映已打开'}), 500

        return send_file(output_path, mimetype='video/mp4', as_attachment=True)
    except subprocess.TimeoutExpired:
        return jsonify({'error': '导出超时（10分钟）'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
