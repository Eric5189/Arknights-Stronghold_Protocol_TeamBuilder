/* Local-only screenshot import. Heavy OCR assets are loaded on demand. */
window.BanOcr = (() => {
  const asset = path => new URL(path, document.baseURI).href;
  let scriptPromise;
  function loadEngine() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = asset('vendor/ocr/tesseract.min.js');
      script.onload = resolve;
      script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error('OCR 引擎加载失败，请检查站点资源或重试')); };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  // Contrast enhancement and 2x nearest-neighbor enlargement for gray game labels.
  function textBand(canvas, band, binary = false) {
    const width = canvas.width, height = band.height;
    const source = canvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, band.top, width, height);
    for (let i = 0; i < source.data.length; i += 4) {
      const light = (source.data[i] + source.data[i + 1] + source.data[i + 2]) / 3;
      const value = binary ? (light >= 95 ? 0 : 255)
        : 255 - Math.max(0, Math.min(255, (light - 45) * 3));
      source.data[i] = source.data[i + 1] = source.data[i + 2] = value;
      source.data[i + 3] = 255;
    }
    const small = document.createElement('canvas');
    small.width = width; small.height = height;
    small.getContext('2d').putImageData(source, 0, 0);
    const output = document.createElement('canvas');
    output.width = width * 2; output.height = height * 2;
    const ctx = output.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, output.width, output.height);
    return output;
  }

  function init(config) {
    const $ = id => document.getElementById(id);
    const module = $('ban-ocr-module'), fileInput = $('ban-ocr-file');
    const status = $('ban-ocr-status'), review = $('ban-ocr-review');
    const apply = $('btn-ocr-apply'), upload = $('btn-ocr-upload'), cancel = $('btn-ocr-cancel');
    const drop = $('ban-ocr-drop'), preview = $('ban-ocr-preview');
    let worker = null, busy = false, job = 0, previewUrl = null;
    let selected = { main: new Set(), sub: new Set() };
    const setStatus = text => { status.textContent = text; };
    const setBusy = value => {
      busy = value; upload.disabled = value; fileInput.disabled = value;
      cancel.hidden = !value; drop.setAttribute('aria-busy', String(value));
    };
    const updateReview = () => {
      for (const type of ['main', 'sub']) {
        $(`ocr-${type}-count`).textContent = selected[type].size;
        $(`ocr-review-${type}`).querySelectorAll('button').forEach(button => {
          const on = selected[type].has(button.dataset.trait);
          button.classList.toggle('active', on);
          button.setAttribute('aria-pressed', String(on));
          button.disabled = selected[type].size >= 5 && !on;
        });
      }
      apply.disabled = busy || selected.main.size !== 5 || selected.sub.size !== 5;
    };
    function showReview(result) {
      selected = { main: new Set(result.main.banned), sub: new Set(result.sub.banned) };
      for (const type of ['main', 'sub']) {
        const list = $(`ocr-review-${type}`);
        list.replaceChildren();
        for (const name of config[type]) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'filter-tag';
          button.textContent = name; button.dataset.trait = name;
          button.addEventListener('click', () => {
            if (selected[type].has(name)) selected[type].delete(name);
            else if (selected[type].size < 5) selected[type].add(name);
            updateReview();
          });
          list.appendChild(button);
        }
      }
      const issues = ['main', 'sub'].filter(type => !result[type].valid)
        .map(type => `${type === 'main' ? '主' : '副'}羁绊：${result[type].reason}${result[type].missing.length ? `（未找到：${result[type].missing.join('、')}）` : ''}`);
      if (result.corrections.length) issues.push(`已按名单校正：${result.corrections.map(m => `${m.raw}→${m.name}${m.inferred ? '（低置信度）' : ''}`).join('、')}，请核对。`);
      $('ban-ocr-notice').textContent = issues.join('\n') || '名称数量与组内顺序校验通过，请核对下方选择。';
      review.hidden = false;
      updateReview();
    }

    async function recognize(file) {
      if (busy) return;
      module.open = true;
      if (!file || !/^image\//.test(file.type)) { setStatus('请选择或粘贴一张图片。'); return; }
      if (file.size > 20 * 1024 * 1024) { setStatus('图片超过20 MB，请先缩小截图。'); return; }
      const currentJob = ++job;
      setBusy(true); apply.disabled = true; review.hidden = true;
      setStatus('正在读取图片…');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl; preview.hidden = false;
      let canvas;
      try {
        const image = new Image();
        image.src = previewUrl;
        await image.decode();
        if (currentJob !== job) return;
        const scale = Math.min(1, 2600 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        if (canvas.width < 400 || canvas.height < 200) throw new Error('截图尺寸过小，请提供完整且清晰的盟约列表');
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
        setStatus('正在加载本地 OCR 引擎和中文模型…');
        await loadEngine();
        if (currentJob !== job) return;
        if (!worker) {
          const created = await Tesseract.createWorker('chi_sim', 1, {
            workerPath: asset('vendor/ocr/worker.min.js'),
            corePath: asset('vendor/ocr/core/'),
            langPath: asset('vendor/ocr/lang/'),
            workerBlobURL: false,
            logger: message => {
              if (!busy) return;
              const percent = Math.round((message.progress || 0) * 100);
              setStatus(message.status === 'recognizing text' ? `正在识别文字… ${percent}%`
                : `正在准备识别资源… ${percent}%`);
            },
          });
          if (currentJob !== job) { await created.terminate(); return; }
          worker = created;
        }
        await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
        const { data } = await worker.recognize(canvas, {}, { blocks: true });
        if (currentJob !== job) return;
        const bands = BanOcrCore.findTextBands(data, [...config.main, ...config.sub], canvas.height);
        if (!bands.length) throw new Error('未找到盟约名称行，请使用包含完整盟约列表的截图');
        const rows = [];
        await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE });
        for (const band of bands) {
          const processed = textBand(canvas, band);
          const result = await worker.recognize(processed);
          processed.width = processed.height = 0;
          if (currentJob !== job) return;
          rows.push(result.data.text);
        }
        let result = BanOcrCore.interpretRows(rows, config.main, config.sub);
        if (!result.main.valid || !result.sub.valid) {
          // Retry ambiguous rows with binary text, retaining whichever reading covers more names.
          const names = [...config.main, ...config.sub, '绝技'];
          for (let i = 0; i < bands.length; i++) {
            const processed = textBand(canvas, bands[i], true);
            const retry = await worker.recognize(processed);
            processed.width = processed.height = 0;
            if (currentJob !== job) return;
            const score = text => {
              const matches = BanOcrCore.matchRow(text, names);
              return new Set(matches.map(m => m.name)).size * 100 - matches.filter(m => m.corrected).length;
            };
            if (score(retry.data.text) > score(rows[i])) rows[i] = retry.data.text;
          }
          result = BanOcrCore.interpretRows(rows, config.main, config.sub);
        }
        $('ban-ocr-raw').textContent = rows.join('\n');
        setBusy(false);
        showReview(result);
        setStatus(result.main.valid && result.sub.valid ? '识别完成：主、副羁绊各5个，核对后点击应用。'
          : '识别结果不完整，未修改本局禁用。可重新上传或在下方手动修正。');
      } catch (error) {
        if (currentJob !== job) return;
        if (worker) { worker.terminate(); worker = null; }
        setStatus(`识别失败：${error.message || '请重试'}。仍可使用原来的手动禁用。`);
      } finally {
        if (canvas) canvas.width = canvas.height = 0;
        if (currentJob === job) { setBusy(false); updateReview(); }
        fileInput.value = '';
      }
    }

    upload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => recognize(fileInput.files[0]));
    drop.addEventListener('keydown', event => {
      if (event.target === drop && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fileInput.click(); }
    });
    drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', event => {
      event.preventDefault(); drop.classList.remove('drag-over');
      recognize([...event.dataTransfer.files].find(file => file.type.startsWith('image/')));
    });
    document.addEventListener('paste', event => {
      if (!config.isBanMode() || /^(INPUT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable) return;
      const file = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile();
      if (file) { event.preventDefault(); recognize(file); }
    });
    cancel.addEventListener('click', () => {
      job++;
      if (worker) { worker.terminate(); worker = null; }
      setBusy(false); updateReview(); setStatus('已取消识别，本局禁用未修改。');
    });
    apply.addEventListener('click', () => {
      if (apply.disabled) return;
      try {
        config.onApply({ main: [...selected.main], sub: [...selected.sub] });
        setStatus('已应用：主、副羁绊各5个；手动禁用干员已保留。');
      } catch (error) { setStatus(error.message); }
    });
  }
  return { init, textBand };
})();
