import React, { useState, useCallback } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import MainLayout from './components/MainLayout'

export interface PipelineData {
  scriptInput: string
  scriptOutput: string
  referenceAudio: string
  referenceFileName: string
  cloneAudioPath: string
  serverAudioPath: string
  cloneAudioFileName: string
  videoPath: string
  videoFileName: string
  projectName: string
  bgmStyle: string
  bgmVolume: number
  addTitle: boolean
  titleText: string
  resolution: number
  fps: number
  autoExport: boolean
}

const defaultPipeline: PipelineData = {
  scriptInput: '',
  scriptOutput: '',
  referenceAudio: '',
  referenceFileName: '',
  cloneAudioPath: '',
  serverAudioPath: '',
  cloneAudioFileName: '',
  videoPath: '',
  videoFileName: '',
  projectName: '',
  bgmStyle: '科技',
  bgmVolume: 30,
  addTitle: true,
  titleText: '',
  resolution: 1080,
  fps: 30,
  autoExport: false,
}

const App: React.FC = () => {
  const [pipeline, setPipeline] = useState<PipelineData>(defaultPipeline)

  const updatePipeline = useCallback((partial: Partial<PipelineData>) => {
    setPipeline((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetPipeline = useCallback(() => {
    setPipeline(defaultPipeline)
  }, [])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#6c5ce7',
          colorBgContainer: '#1a1a2e',
          colorBgElevated: '#23233a',
          colorBorder: '#3a3a5c',
          borderRadius: 8,
        },
      }}
    >
      <MainLayout pipeline={pipeline} updatePipeline={updatePipeline} resetPipeline={resetPipeline} />
    </ConfigProvider>
  )
}

export default App
