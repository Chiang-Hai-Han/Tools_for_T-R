"""
本地 OCR 服务 - 截图文字识别 + CSV 管理
启动方式: python ocr_server.py
端口: 8765

API:
  POST /ocr      - 接收 base64 截图, OCR 识别顶部文字, 返回识别结果
  GET  /results  - 获取所有识别记录 (JSON)
  GET  /export   - 下载 CSV 文件
  DELETE /clear  - 清空所有记录
  GET  /health   - 健康检查
"""

import base64
import io
import csv
import os
import re
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, Response

# === EasyOCR 模型存放目录（放在当前脚本同目录下，避免 ~/.EasyOCR 权限问题）===
MODEL_DIR = Path(__file__).parent / '.easyocr_models'
MODEL_DIR.mkdir(parents=True, exist_ok=True)
os.environ['EASYOCR_MODULE_PATH'] = str(MODEL_DIR)

app = Flask(__name__)

# === 存储 ===
records = []   # [{id, time, url, title, text_raw, text_clean, cropped_w, cropped_h}]
_id_counter = [0]

# === 懒加载 EasyOCR (首次请求才初始化, 避免启动等待) ===
reader = None

def get_reader():
    global reader
    if reader is None:
        # 修复 Windows OpenSSL Applink 问题
        import ssl
        ssl._create_default_https_context = ssl._create_unverified_context
        import easyocr
        reader = easyocr.Reader(
            ['ch_tra'],
            gpu=False,
            model_storage_directory=str(MODEL_DIR),
            download_enabled=True
        )
        print(f'[OCR] 模型載入完成 (detection+cognition)')
    return reader

# === 裁剪顶部区域 ===
def crop_top_region(img_bytes, ratio=0.2, min_h=30):
    """从 PNG/JPEG 字节数据裁剪顶部 ratio 区域"""
    from PIL import Image
    img = Image.open(io.BytesIO(img_bytes))
    w, h = img.size
    crop_h = max(int(h * ratio), min_h)
    crop_h = min(crop_h, h)
    cropped = img.crop((0, 0, w, crop_h))
    # 转为 RGB numpy 数组给 EasyOCR
    import numpy as np
    arr = np.array(cropped.convert('RGB'))
    return arr, crop_h

# === 清理文字 ===
def clean_text(raw):
    """去重、合并断行、去掉纯空格"""
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    # 去相邻完全重复行
    deduped = []
    for l in lines:
        if not deduped or l != deduped[-1]:
            deduped.append(l)
    return ' | '.join(deduped)

# === CORS 支持 (允许扩展访问) ===
@app.after_request
def add_cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'
    return resp

@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    return jsonify({
        'status': 'ok',
        'reader_ready': reader is not None,
        'records': len(records)
    })

@app.route('/ocr', methods=['POST', 'OPTIONS'])
def ocr():
    """接收截图, OCR 识别顶部文字"""
    if request.method == 'OPTIONS':
        return Response('', 204)

    data = request.get_json(force=True)
    img_b64 = data.get('image', '')
    page_url = data.get('url', '')
    page_title = data.get('title', '')

    if not img_b64:
        return jsonify({'error': '缺少 image 字段'}), 400

    # 去掉 data:image/png;base64, 前缀
    if ',' in img_b64:
        img_b64 = img_b64.split(',', 1)[1]

    try:
        img_bytes = base64.b64decode(img_b64)
    except Exception as e:
        return jsonify({'error': f'base64 解码失败: {str(e)}'}), 400

    # 裁剪顶部区域
    try:
        cropped_arr, crop_h = crop_top_region(img_bytes)
    except Exception as e:
        return jsonify({'error': f'图片裁剪失败: {str(e)}'}), 400

    # OCR 识别
    try:
        r = get_reader()
        results = r.readtext(cropped_arr, detail=0)
        raw_text = '\n'.join(results)
        cleaned = clean_text(raw_text)
    except Exception as e:
        return jsonify({'error': f'OCR 识别失败: {str(e)}'}), 500

    # 存储
    _id_counter[0] += 1
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    record = {
        'id': _id_counter[0],
        'time': now,
        'url': page_url,
        'title': page_title,
        'text_raw': raw_text,
        'text_clean': cleaned,
        'cropped_h': crop_h
    }
    records.append(record)

    return jsonify({
        'ok': True,
        'record': record
    })

@app.route('/results', methods=['GET'])
def get_results():
    return jsonify({'records': records})

@app.route('/export', methods=['GET'])
def export_csv():
    """导出 CSV (UTF-8 BOM, Excel 可直接打开)"""
    output = io.StringIO()
    output.write('\ufeff')  # UTF-8 BOM
    writer = csv.writer(output)
    writer.writerow(['序号', '时间', '页面标题', '页面URL', '识别文字(原始)', '识别文字(整理)'])

    for i, r in enumerate(records, 1):
        writer.writerow([
            i,
            r['time'],
            r['title'],
            r['url'],
            r['text_raw'],
            r['text_clean']
        ])

    csv_content = output.getvalue()
    output.close()

    fname = f"OCR_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        csv_content,
        mimetype='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{fname}"',
            'Content-Type': 'text/csv; charset=utf-8'
        }
    )

@app.route('/clear', methods=['DELETE'])
def clear():
    records.clear()
    _id_counter[0] = 0
    return jsonify({'ok': True, 'cleared': True})


if __name__ == '__main__':
    print('=' * 50)
    print('  截图 OCR 本地服务')
    print('  端口: http://localhost:8765')
    print('  健康检查: http://localhost:8765/health')
    print('  按 Ctrl+C 停止')
    print('=' * 50)
    app.run(host='127.0.0.1', port=8765, debug=False)
