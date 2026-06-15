# Tools_for_T-R

教研工作小工具集合。

## 包含的工具

### 1. screenshot-ocr-extension

Chrome 浏览器扩展 + 本地 OCR 服务，用于截取屏幕区域并识别文字，导出为 CSV。

```
screenshot-ocr-extension/
├── ocr_server.py       # Flask 后端 OCR 服务（端口 8765）
├── background.js       # 扩展后台
├── popup.html / .js    # 弹窗界面
├── manifest.json       # 插件清单
└── 啟動OCR服務.bat     # 一键启动
```

**启动方式：**
```bash
# 1. 启动 OCR 服务
python screenshot-ocr-extension/ocr_server.py

# 2. 在 Chrome 加载 screenshot-ocr-extension/ 文件夹
```

### 2. batch-tts-from-excel

从 Excel 台词表批量生成 TTS 语音。详见 `batch-tts-from-excel/SKILL.md`。

## 依赖安装

```bash
pip install -r requirements.txt
```

## 作者

**海瀚（Chiang-Hai-Han）**

## License

MIT
