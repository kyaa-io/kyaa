#!/usr/bin/env python3
"""Prepare a new, immutable local show bundle; originals are never modified."""
import argparse
import json
import ctypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid
import xml.etree.ElementTree as ET
import zipfile

# Semantic titles, not slide numbers: reordered replacement decks remain safe.
TITLES = {
    'reception': 'CHECK-IN & RECEPTION', 'dinner': 'DINNER',
    'opening': 'OPENING CEREMONY', 'welcome': 'WELCOME REMARKS',
    'company': 'COMPANY INTRODUCTION', 'quiz': 'QUIZ EVENT',
    'qa': 'Q&A', 'relay': 'GUEST INTRODUCTIONS', 'photo': 'GROUP PHOTO',
    'party': 'AFTER PARTY', 'raffle': 'LUCKY DRAW', 'thanks': 'SEE YOU IN',
}
ADAPTER_START = '<!-- KYAA_STAGE_ADAPTER_START -->'
ADAPTER_END = '<!-- KYAA_STAGE_ADAPTER_END -->'
ADAPTER = '''<!-- KYAA_STAGE_ADAPTER_START -->
<style>
html,body {width:100%;height:100%;margin:0;overflow:hidden}
body.deck-only .mode-controls,body.deck-only .present-controls {display:none!important}
body.deck-only .stage {width:100vw;height:100dvh}
body.deck-only #slideStage:focus-visible {outline:none}
body.deck-only .slide-frame {width:min(100cqw,calc(100cqh * 16 / 9));height:auto}
</style>
<script>
(() => {
  setPresentation(true);
  const report = (event) => parent.postMessage({type:'kyaa-stage-media',event:event.type,index,
    playing:!event.target.paused,position:event.target.currentTime},location.origin);
  document.querySelectorAll('.slide video').forEach(video => {
    ['play','pause','ended','error','timeupdate'].forEach(name => video.addEventListener(name,report));
  });
  window.addEventListener('message',async event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.type !== 'kyaa-stage') return;
    if (message.action === 'slide' && Number.isInteger(message.index) && message.index >= 0 && message.index < slides.length) {
      setPresentation(true);
      showSlide(message.index);
      parent.postMessage({type:'kyaa-stage-media',event:'ready',index},location.origin);
    }
    if (message.action === 'media' && ['play','pause','restart'].includes(message.operation)) {
      for (const video of videos()) {
        if (message.operation === 'pause') video.pause();
        else {
          if (message.operation === 'restart') video.currentTime = 0;
          try { await video.play(); }
          catch { $('notice').textContent = '영상 안의 재생 버튼을 눌러주세요.';
            parent.postMessage({type:'kyaa-stage-media',event:'error',index},location.origin); }
        }
      }
    }
  });
  parent.postMessage({type:'kyaa-stage-media',event:'ready',index},location.origin);
})();
</script>
<!-- KYAA_STAGE_ADAPTER_END -->'''


def slide_titles(pptx):
    with zipfile.ZipFile(pptx) as archive:
        root = ET.fromstring(archive.read('ppt/presentation.xml'))
        rels = ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))
        targets = {r.attrib['Id']: r.attrib['Target'] for r in rels}
        slide_ids = root.find('{http://schemas.openxmlformats.org/presentationml/2006/main}sldIdLst')
        texts = []
        for slide in slide_ids:
            target = targets[slide.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            member = target.lstrip('/') if target.startswith('/') else 'ppt/' + target
            xml = ET.fromstring(archive.read(member))
            texts.append([' '.join((t.text or '').split()) for t in xml.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}t')])
    return texts


def map_slides(texts):
    result = {}
    for key, title in TITLES.items():
        matches = [i + 1 for i, fragments in enumerate(texts) if title in fragments]
        if len(matches) != 1:
            raise ValueError(f'PPT title {title!r}: expected exactly one slide, found {len(matches)}')
        result[key] = matches[0]
    return result


def adapt_html(source):
    source = re.sub(re.escape(ADAPTER_START) + r'.*?' + re.escape(ADAPTER_END), '', source, flags=re.S)
    match = re.search(r'<script\s+id="slideData"\s+type="application/json">(.*?)</script>', source, re.S)
    if not match:
        raise ValueError('HTML slideData not found')
    data = json.loads(match.group(1))
    if len(data) != 16 or any(not isinstance(slide.get('speech'), list) for slide in data):
        raise ValueError('Expected original 16-slide HTML with speech arrays')
    if '</body>' not in source or 'function showSlide(' not in source:
        raise ValueError('HTML presentation functions not found')
    return source.replace('</body>', ADAPTER + '\n</body>'), data


def make_cues(mapping, slides):
    cues = []
    def add(id, kind, label, time=None, **extra):
        cue = dict(id=id, type=kind, label=label, section='KYAA WAVE 2026', script=[], **extra)
        if time: cue['time'] = time
        cues.append(cue)
        return cue
    def static(key, label, time, id=None):
        number = mapping[key]
        return add(id or key, 'slide', label, time, asset=f'slides/slide-{number:02}.png', thumbnail=f'thumbnails/slide-{number:02}.png')
    def html(number, prefix, time=None):
        slide = slides[number-1]
        cue = add(f'{prefix}-{number:02}', 'html', slide['title'], time or slide.get('time'), asset='personal.html', slideIndex=number-1)
        cue['script'] = slide['speech']
        return cue
    static('reception','접수 · 리셉션','18:30'); static('dinner','저녁 식사','19:00')
    static('opening','개회','19:30'); add('agenda','hold','오늘의 프로그램','19:31')
    static('welcome','환영사','19:34'); static('company','MC · 회사 소개','19:40')
    add('intro','video','KYAA 소개 영상','19:44:23',asset='intro.mp4',nextOnEnd='pre-01')
    for number in range(1,6): html(number,'pre','19:45' if number == 1 else None)
    html(6,'standby','19:50')
    add('live-talk','live','LIVE 팬 소통 · 시연','19:53',layout='triptych')
    add('live-performance','live','LIVE 공연','19:58',layout='performance')
    html(7,'buffer','20:03')
    for number in range(7,17): html(number,'post','20:05' if number == 7 else None)
    add('na-pd','hold','SESSION 02 · 나영석 PD','20:15')
    static('qa','질문과 답변','20:30'); static('relay','참가자 릴레이 PR','20:40')
    static('quiz','퀴즈 이벤트','20:45'); add('groupwork','hold','그룹 워크','21:05')
    static('photo','단체사진','21:25'); static('thanks','감사 인사','21:28')
    static('party','애프터파티','21:30'); static('raffle','럭키드로우',None)
    static('thanks','마무리','23:00',id='closing')
    return cues


def run(command, **kwargs):
    subprocess.run(command, check=True, timeout=240, **kwargs)


def export_pdf(pptx, directory):
    # Isolated LO profile avoids changing or closing the user's open documents.
    soffice = shutil.which('soffice') or next((str(p) for p in (Path('/Applications/LibreOffice.app/Contents/MacOS/soffice'), Path.home() / '.local/bin/soffice') if p.is_file()), None)
    if not soffice:
        raise RuntimeError('LibreOffice soffice is required for PPT import')
    with tempfile.TemporaryDirectory(prefix='kyaa-lo-') as profile:
        run([soffice, '-env:UserInstallation=' + Path(profile).as_uri(), '--headless', '--convert-to', 'pdf', '--outdir', str(directory), str(pptx)])
    pdf = directory / (pptx.stem + '.pdf')
    if not pdf.is_file(): raise RuntimeError('PPT PDF export failed')
    return pdf


def publish_bundle(bundle, out):
    # RENAME_EXCL closes the race with another import publishing this name.
    if os.uname().sysname == 'Darwin':
        rename = ctypes.CDLL(None, use_errno=True).renamex_np
        if rename(os.fsencode(bundle), os.fsencode(out), 4):
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error), str(out))
    else:
        if out.exists(): raise FileExistsError(str(out))
        bundle.rename(out)


def prepare(pptx, html, video, out):
    for source in (pptx, html, video):
        if not source.is_file(): raise ValueError(f'Input not found: {source}')
    if out.exists(): raise FileExistsError(f'Output already exists; choose a new revision: {out}')
    mapping = map_slides(slide_titles(pptx))
    adapted, slides = adapt_html(html.read_text())
    out.parent.mkdir(parents=True, exist_ok=True)
    # Build beside destination, then publish atomically; never overwrite a show.
    with tempfile.TemporaryDirectory(prefix='.' + out.name + '-', dir=out.parent) as temp:
        bundle = Path(temp) / 'bundle'; bundle.mkdir()
        (bundle / 'slides').mkdir(); (bundle / 'thumbnails').mkdir(); (bundle / 'sources').mkdir()
        shutil.copy2(pptx, bundle / 'sources/event.pptx')
        shutil.copy2(html, bundle / 'sources/personal.html')
        shutil.copy2(video, bundle / 'intro.mp4')
        (bundle / 'personal.html').write_text(adapted)
        pdf = export_pdf(pptx, Path(temp))
        pdftoppm = shutil.which('pdftoppm') or next((str(p) for p in (Path('/opt/homebrew/bin/pdftoppm'), Path('/usr/local/bin/pdftoppm')) if p.is_file()), None)
        if not pdftoppm: raise RuntimeError('Poppler pdftoppm is required for PPT import')
        run([pdftoppm,'-png','-scale-to','1920',str(pdf),str(bundle / 'slides/slide')], stdout=subprocess.DEVNULL)
        pages = sorted((bundle / 'slides').glob('slide-*.png'))
        if len(pages) != len(slide_titles(pptx)): raise ValueError('Exported PDF page count differs from PPT')
        # pdftoppm uses one-digit suffixes for short decks; normalize filenames.
        for page in pages:
            number = int(page.stem.split('-')[-1]); normalized = page.with_name(f'slide-{number:02}.png')
            if page != normalized: page.rename(normalized)
        run([pdftoppm,'-png','-scale-to','480',str(pdf),str(bundle / 'thumbnails/slide')], stdout=subprocess.DEVNULL)
        for page in (bundle / 'thumbnails').glob('slide-*.png'):
            normalized = page.with_name(f'slide-{int(page.stem.split("-")[-1]):02}.png')
            if page != normalized: page.rename(normalized)
        manifest = dict(version=1, revision=str(uuid.uuid4()), title='KYAA WAVE 2026', cues=make_cues(mapping, slides))
        for cue in manifest['cues']:
            for key in ('asset','thumbnail'):
                if key in cue and not (bundle / cue[key]).is_file(): raise ValueError(f'Missing {key}: {cue[key]}')
        (bundle / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        if out.exists(): raise FileExistsError(f'Output appeared while importing: {out}')
        publish_bundle(bundle, out)
    return out / 'manifest.json'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('pptx','html','video','out'): parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    try:
        print(prepare(args.pptx.resolve(),args.html.resolve(),args.video.resolve(),args.out.resolve()))
    except (ValueError,OSError,RuntimeError,subprocess.SubprocessError) as error:
        parser.exit(1,str(error)+'\n')
