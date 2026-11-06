import React, { useState, useRef } from 'react'
import {
  Layout, Typography, Card, Input, Select, Button, Space, Row, Col,
  Slider, Switch, message, Upload, Tag, Radio, Modal, Alert,
} from 'antd'
import {
  EditOutlined, AudioOutlined, ScissorOutlined, ReloadOutlined,
  SendOutlined, CopyOutlined, LinkOutlined, FileTextOutlined,
  SoundOutlined, UploadOutlined, PlayCircleOutlined, CheckCircleOutlined,
  VideoCameraOutlined, DownloadOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import type { PipelineData } from '../App'

const { Header, Content } = Layout
const { TextArea } = Input
const { Text, Title } = Typography
const { Option } = Select

interface Props {
  pipeline: PipelineData
  updatePipeline: (partial: Partial<PipelineData>) => void
  resetPipeline: () => void
}

const STYLE_PRESETS = [
  { label: '口语化', value: 'casual' },
  { label: '专业严谨', value: 'professional' },
  { label: '幽默风趣', value: 'humorous' },
  { label: '悬念钩子', value: 'suspense' },
  { label: '种草安利', value: 'recommend' },
]

const cardStyle = { background: '#1a1a2e', borderColor: '#3a3a5c' }
const innerBg = { background: '#12122a', borderColor: '#3a3a5c' }

// ===================== 文案仿写面板 =====================
const ScriptPanel: React.FC<Props> = ({ pipeline, updatePipeline }) => {
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text')
  const [style, setStyle] = useState('casual')
  const [length, setLength] = useState('medium')
  const [creativity, setCreativity] = useState(70)
  const [addHook, setAddHook] = useState(true)
  const [loading, setLoading] = useState(false)

  const canGenerate = pipeline.scriptInput.trim().length > 0
  const hasOutput = pipeline.scriptOutput.trim().length > 0

  const handleGenerate = async () => {
    if (!pipeline.scriptInput.trim()) return message.warning('请输入文案或视频链接')
    setLoading(true)
    try {
      const res = await axios.post('/api/script/rewrite', {
        text: pipeline.scriptInput, style, length,
        creativity: creativity / 100, add_hook: addHook, input_type: inputMode,
      })
      updatePipeline({ scriptOutput: res.data.result })
      message.success('仿写完成')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '仿写失败')
    } finally { setLoading(false) }
  }

  return (
    <Card title={<span><EditOutlined /> 文案仿写</span>} style={cardStyle} styles={{ body: { padding: '12px 14px' } }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        <Radio.Group value={inputMode} onChange={(e) => setInputMode(e.target.value)} size="small">
          <Radio.Button value="text"><FileTextOutlined /> 文本</Radio.Button>
          <Radio.Button value="url"><LinkOutlined /> 视频链接</Radio.Button>
        </Radio.Group>

        {inputMode === 'text' ? (
          <TextArea
            value={pipeline.scriptInput}
            onChange={(e) => updatePipeline({ scriptInput: e.target.value })}
            placeholder="粘贴原始文案..."
            rows={3} style={{ ...innerBg, color: '#e0e0e0' }}
          />
        ) : (
          <Input
            value={pipeline.scriptInput}
            onChange={(e) => updatePipeline({ scriptInput: e.target.value })}
            placeholder="粘贴视频链接（抖音/B站/小红书）" style={{ ...innerBg, color: '#e0e0e0' }}
            prefix={<LinkOutlined style={{ color: '#6c5ce7' }} />}
          />
        )}

        <Row gutter={6}>
          <Col span={8}>
            <Text style={{ color: '#aaa', fontSize: 11 }}>风格</Text>
            <Select size="small" value={style} onChange={setStyle} style={{ width: '100%' }}>
              {STYLE_PRESETS.map((s) => <Option key={s.value} value={s.value}>{s.label}</Option>)}
            </Select>
          </Col>
          <Col span={8}>
            <Text style={{ color: '#aaa', fontSize: 11 }}>长度</Text>
            <Select size="small" value={length} onChange={setLength} style={{ width: '100%' }}>
              <Option value="short">短视频</Option>
              <Option value="medium">中视频</Option>
              <Option value="long">长视频</Option>
            </Select>
          </Col>
          <Col span={8}>
            <Text style={{ color: '#aaa', fontSize: 11 }}>创意度</Text>
            <Slider size="small" value={creativity} onChange={setCreativity} min={10} max={100} style={{ margin: 0 }} />
          </Col>
        </Row>

        <Space>
          <Switch checked={addHook} onChange={setAddHook} size="small" />
          <Text style={{ color: '#ccc', fontSize: 11 }}>加钩子</Text>
        </Space>

        <Button type="primary" size="small" icon={<SendOutlined />} onClick={handleGenerate} loading={loading} disabled={!canGenerate} block>
          开始仿写
        </Button>

        {hasOutput && (
          <div style={{ ...innerBg, borderRadius: 6, padding: 8, border: '1px solid #2a4a3a' }}>
            <Row justify="space-between" style={{ marginBottom: 4 }}>
              <Text style={{ color: '#6c5ce7', fontSize: 11 }}>
                结果 <Tag color="green" style={{ fontSize: 10 }}>{pipeline.scriptOutput.length}字</Tag>
              </Text>
              <Space size={4}>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(pipeline.scriptOutput); message.success('已复制') }} />
                <Button size="small" type="text" icon={<SendOutlined />} onClick={handleGenerate} loading={loading} />
              </Space>
            </Row>
            <TextArea
              value={pipeline.scriptOutput}
              onChange={(e) => updatePipeline({ scriptOutput: e.target.value })}
              rows={3} style={{ ...innerBg, color: '#e0e0e0', fontSize: 12 }}
            />
          </div>
        )}
      </Space>
    </Card>
  )
}

// ===================== 声音克隆面板 =====================
const VoicePanel: React.FC<Props> = ({ pipeline, updatePipeline }) => {
  const [cfgValue, setCfgValue] = useState(2.0)
  const [inferenceSteps, setInferenceSteps] = useState(10)
  const [normalize, setNormalize] = useState(true)
  const [loading, setLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const hasReference = pipeline.referenceAudio.length > 0
  const hasClone = pipeline.cloneAudioPath.length > 0
  const hasScript = pipeline.scriptOutput.trim().length > 0

  const handleUpload = async (file: File) => {
    const formData = new FormData(); formData.append('audio', file)
    try {
      const res = await axios.post('/api/voice/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      updatePipeline({ referenceAudio: res.data.path, referenceFileName: file.name })
      message.success(file.name)
    } catch { message.error('上传失败') }
    return false
  }

  const handleGenerate = async () => {
    if (!pipeline.scriptOutput.trim()) return message.warning('请先完成文案仿写')
    if (!hasReference) return message.warning('请上传参考音频')
    setLoading(true)
    try {
      const res = await axios.post('/api/voice/generate', {
        text: pipeline.scriptOutput, mode: 'controlled',
        reference_audio: pipeline.referenceAudio, cfg_value: cfgValue,
        inference_steps: inferenceSteps, normalize,
      }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const serverPath = res.headers['x-audio-local-path'] || ''
      const duration = res.headers['x-audio-duration'] || ''
      updatePipeline({ cloneAudioPath: url, serverAudioPath: serverPath, cloneAudioFileName: `clone_voice.wav` })
      message.success(`克隆完成！(${duration}s)`)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '克隆失败')
    } finally { setLoading(false) }
  }

  return (
    <Card title={<span><AudioOutlined /> 声音克隆</span>} style={cardStyle} styles={{ body: { padding: '12px 14px' } }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        {!hasScript ? (
          <Alert type="warning" title="请先在左侧完成文案仿写" showIcon style={{ background: '#2a231a', borderColor: '#5c4a2a' }} />
        ) : (
          <div style={{ ...innerBg, borderRadius: 6, padding: 6, border: '1px solid #2a4a3a', maxHeight: 60, overflowY: 'auto' }}>
            <Text style={{ color: '#6c5ce7', fontSize: 10 }}>📝 朗读文本（来自仿写）</Text>
            <div style={{ color: '#ccc', fontSize: 11, whiteSpace: 'pre-wrap' }}>{pipeline.scriptOutput.slice(0, 100)}{pipeline.scriptOutput.length > 100 ? '...' : ''}</div>
          </div>
        )}

        <div>
          <Upload accept="audio/*" showUploadList={false} beforeUpload={handleUpload}>
            <Button size="small" icon={<UploadOutlined />} block>
              {pipeline.referenceFileName ? `✅ ${pipeline.referenceFileName.slice(0, 18)}` : '上传声音样本'}
            </Button>
          </Upload>
        </div>

        <Row gutter={6}>
          <Col span={12}>
            <Text style={{ color: '#aaa', fontSize: 10 }}>相似度: {cfgValue}</Text>
            <Slider size="small" value={cfgValue} onChange={setCfgValue} min={0.5} max={5.0} step={0.1} style={{ margin: 0 }} />
          </Col>
          <Col span={12}>
            <Text style={{ color: '#aaa', fontSize: 10 }}>质量: {inferenceSteps}步</Text>
            <Slider size="small" value={inferenceSteps} onChange={setInferenceSteps} min={4} max={30} step={1} style={{ margin: 0 }} />
          </Col>
        </Row>

        <Space>
          <Switch size="small" checked={normalize} onChange={setNormalize} />
          <Text style={{ color: '#888', fontSize: 11 }}>归一化</Text>
        </Space>

        <Button
          type="primary" size="small" icon={<SoundOutlined />}
          onClick={handleGenerate} loading={loading} block
          disabled={!hasScript || !hasReference}
        >
          {hasClone ? '🔄 重新生成' : '生成克隆语音'}
        </Button>

        {hasClone && (
          <div style={{ ...innerBg, borderRadius: 6, padding: 8, border: '1px solid #2a4a3a' }}>
            <Row align="middle">
              <Col flex="auto">
                <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 10 }}>克隆完成</Tag>
              </Col>
              <Col>
                <Button size="small" icon={<PlayCircleOutlined />} onClick={() => audioRef.current?.play()}>试听</Button>
              </Col>
            </Row>
            <audio ref={audioRef} src={pipeline.cloneAudioPath} controls style={{ width: '100%', height: 28, marginTop: 4 }} />
          </div>
        )}
      </Space>
    </Card>
  )
}

// ===================== 一键成片面 =====================
const EditPanel: React.FC<Props> = ({ pipeline, updatePipeline }) => {
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [draftCreated, setDraftCreated] = useState(false)

  const hasVideo = pipeline.videoPath.length > 0
  const hasAudio = pipeline.cloneAudioPath.length > 0

  const handleUploadVideo = async (file: File) => {
    const formData = new FormData(); formData.append('file', file)
    try {
      const res = await axios.post('/api/edit/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      updatePipeline({ videoPath: res.data.path, videoFileName: file.name })
      message.success(file.name)
    } catch { message.error('上传失败') }
    return false
  }

  const handleCreateDraft = async () => {
    if (!hasVideo) return message.warning('请上传视频素材')
    setLoading(true)
    try {
      await axios.post('/api/edit/create-draft', {
        project_name: pipeline.projectName || '数字人口播视频',
        video_path: pipeline.videoPath,
        audio_path: pipeline.serverAudioPath,
        script_text: pipeline.scriptOutput,
        bgm_style: pipeline.bgmStyle,
        bgm_volume: pipeline.bgmVolume,
        add_title: pipeline.addTitle,
        title_text: pipeline.titleText || pipeline.projectName || '',
        resolution: pipeline.resolution,
        fps: pipeline.fps,
      })
      setDraftCreated(true)
      message.success('草稿创建成功！打开剪映查看')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建失败')
    } finally { setLoading(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await axios.post('/api/edit/export', {
        project_name: pipeline.projectName || '数字人口播视频',
        resolution: pipeline.resolution, fps: pipeline.fps,
      }, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(res.data)
      a.download = `${pipeline.projectName || 'output'}.mp4`
      a.click()
      message.success('导出完成')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '导出失败，需剪映运行')
    } finally { setExporting(false) }
  }

  return (
    <Card
      title={<span><ScissorOutlined /> 一键成片</span>}
      style={cardStyle}
      styles={{ body: { padding: '12px 14px' } }}
      extra={
        <Space size={4}>
          {draftCreated && <Tag color="success">✅ 已创建</Tag>}
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExport} loading={exporting} disabled={!draftCreated}>导出MP4</Button>
        </Space>
      }
    >
      <Row gutter={10}>
        <Col span={9}>
          <Space orientation="vertical" style={{ width: '100%' }} size={6}>
            <Text style={{ color: '#aaa', fontSize: 11 }}>项目名称</Text>
            <Input size="small" value={pipeline.projectName}
              onChange={(e) => updatePipeline({ projectName: e.target.value })}
              placeholder="项目名称" style={innerBg} />

            <Text style={{ color: '#aaa', fontSize: 11 }}>分辨率 / 帧率</Text>
            <Row gutter={6}>
              <Col span={12}>
                <Select size="small" value={pipeline.resolution} onChange={(v) => updatePipeline({ resolution: v })} style={{ width: '100%' }}>
                  <Option value={720}>720p</Option>
                  <Option value={1080}>1080p</Option>
                  <Option value={2160}>4K</Option>
                </Select>
              </Col>
              <Col span={12}>
                <Select size="small" value={pipeline.fps} onChange={(v) => updatePipeline({ fps: v })} style={{ width: '100%' }}>
                  <Option value={24}>24fps</Option>
                  <Option value={30}>30fps</Option>
                  <Option value={60}>60fps</Option>
                </Select>
              </Col>
            </Row>

            <Text style={{ color: '#aaa', fontSize: 11 }}>BGM风格 / 音量</Text>
            <Row gutter={6}>
              <Col span={12}>
                <Select size="small" value={pipeline.bgmStyle} onChange={(v) => updatePipeline({ bgmStyle: v })} style={{ width: '100%' }}>
                  <Option value="科技">科技</Option><Option value="温暖">温暖</Option>
                  <Option value="节奏">节奏</Option><Option value="古风">古风</Option>
                  <Option value="轻柔">轻柔</Option>
                </Select>
              </Col>
              <Col span={12}>
                <Slider size="small" value={pipeline.bgmVolume} onChange={(v) => updatePipeline({ bgmVolume: v })} min={5} max={100} style={{ margin: '4px 0' }} />
              </Col>
            </Row>

            <Space>
              <Switch size="small" checked={pipeline.addTitle} onChange={(v) => updatePipeline({ addTitle: v })} />
              <Text style={{ color: '#888', fontSize: 11 }}>加标题</Text>
              {pipeline.addTitle && (
                <Input size="small" value={pipeline.titleText} onChange={(e) => updatePipeline({ titleText: e.target.value })} placeholder="标题" style={{ width: 100, ...innerBg }} />
              )}
            </Space>

            <Button type="primary" icon={<ScissorOutlined />} onClick={handleCreateDraft} loading={loading} disabled={!hasVideo} block>
              创建剪映草稿
            </Button>
          </Space>
        </Col>

        <Col span={15}>
          <Space orientation="vertical" style={{ width: '100%' }} size={8}>
            <div style={{ ...innerBg, borderRadius: 6, padding: 8, border: '1px solid #3a3a5c' }}>
              <Row gutter={8}>
                <Col span={12}>
                  <Text style={{ color: '#6c5ce7', fontSize: 10 }}>📝 字幕（仿写文案→自动生成SRT）</Text>
                  <div style={{ color: '#888', fontSize: 10, marginTop: 2, maxHeight: 32, overflowY: 'auto' }}>
                    {pipeline.scriptOutput ? pipeline.scriptOutput.slice(0, 60) + '...' : '⏳ 等待文案仿写'}
                  </div>
                </Col>
                <Col span={12}>
                  <Text style={{ color: '#6c5ce7', fontSize: 10 }}>🔊 配音（声音克隆→自动传入）</Text>
                  <div style={{ color: hasAudio ? '#52c41a' : '#888', fontSize: 10, marginTop: 2 }}>
                    {hasAudio ? '✅ 已就绪' : '⏳ 等待声音克隆'}
                  </div>
                </Col>
              </Row>
            </div>

            <Card size="small" title={<Text style={{ fontSize: 11 }}><VideoCameraOutlined /> 上传对口型视频</Text>} style={{ ...innerBg, borderColor: '#3a3a5c' }}>
              <Upload accept="video/*" showUploadList={false} beforeUpload={handleUploadVideo}>
                <Button size="small" icon={<UploadOutlined />} block>
                  {pipeline.videoFileName ? `✅ ${pipeline.videoFileName.slice(0, 25)}` : '上传数字人视频素材'}
                </Button>
              </Upload>
              <div style={{ color: '#666', fontSize: 10, marginTop: 3 }}>💡 你需要做口型替换的数字人视频</div>
            </Card>

            <Alert
              type="info"
              title="状态检查"
              description={
                <div style={{ fontSize: 11 }}>
                  {!pipeline.scriptOutput && <div style={{ color: '#faad14' }}>⚠️ 第一步未完成：请先做文案仿写</div>}
                  {pipeline.scriptOutput && !hasAudio && <div style={{ color: '#faad14' }}>⚠️ 第二步未完成：请先做声音克隆</div>}
                  {pipeline.scriptOutput && hasAudio && !hasVideo && <div style={{ color: '#faad14' }}>⚠️ 请上传对口型视频</div>}
                  {pipeline.scriptOutput && hasAudio && hasVideo && <div style={{ color: '#52c41a' }}>✅ 全部就绪，可以创建草稿！</div>}
                </div>
              }
              style={{ background: '#1a1a2e', borderColor: '#3a3a5c' }}
              showIcon
            />
          </Space>
        </Col>
      </Row>
    </Card>
  )
}

// ===================== 主布局 =====================
const MainLayout: React.FC<Props> = ({ pipeline, updatePipeline, resetPipeline }) => {
  const handleReset = () => {
    Modal.confirm({
      title: '确认重置', content: '将清空所有数据，确定吗？',
      onOk: () => { resetPipeline(); message.info('已重置') },
    })
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#0f0f1a' }}>
      <Header style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #23233a 100%)',
        borderBottom: '1px solid #3a3a5c', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🎬</span>
          <Title level={5} style={{ color: '#e0e0e0', margin: 0 }}>数字人口播工作室</Title>
        </div>
        <Space size={8}>
          <span style={{ color: '#666', fontSize: 11 }}>VoxCPM2 + JianYing CLI</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
        </Space>
      </Header>

      <Content style={{ padding: '12px 16px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={12}>
            <ScriptPanel pipeline={pipeline} updatePipeline={updatePipeline} resetPipeline={resetPipeline} />
          </Col>
          <Col span={12}>
            <VoicePanel pipeline={pipeline} updatePipeline={updatePipeline} resetPipeline={resetPipeline} />
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={24}>
            <EditPanel pipeline={pipeline} updatePipeline={updatePipeline} resetPipeline={resetPipeline} />
          </Col>
        </Row>
      </Content>
    </Layout>
  )
}

export default MainLayout
