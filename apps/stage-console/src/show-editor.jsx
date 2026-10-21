import React, { useEffect, useId, useRef, useState } from 'react';
import { assetUrl } from './protocol';
import { extractSlideText, slideTextOverrides } from './slide-text';
import './show-editor.css';

export function ShowEditor({ cue, onClose, onSaved }) {
  const id = useId();
  const activeCue = useRef(cue.id);
  activeCue.current = cue.id;
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setDraft(null); setError(''); setBusy(false);
    (async () => {
      try {
        const result = await window.stageNative.readContent(cue.id);
        let fields = [];
        if (result.cue.type === 'html') {
          const response = await fetch(assetUrl(result.cue.asset), { signal: controller.signal });
          if (!response.ok) throw new Error('프레젠테이션 원본을 불러오지 못했습니다.');
          const document = new DOMParser().parseFromString(await response.text(), 'text/html');
          fields = extractSlideText(document, result.cue.slideIndex, result.cue.slideText);
        }
        if (active) setDraft({ ...result.cue, version: result.version, fields });
      } catch (error) { if (active) setError(error.message || '편집 내용을 불러오지 못했습니다.'); }
    })();
    return () => { active = false; controller.abort(); };
  }, [cue.id]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    const savingCueId = draft.id;
    try {
      const payload = { expectedVersion: draft.version, cueId: draft.id, label: draft.label, script: draft.script };
      if (draft.type === 'html') payload.slideText = slideTextOverrides(draft.fields);
      const saved = await window.stageNative.saveContent(payload);
      if (activeCue.current !== savingCueId) return;
      setDraft(current => ({ ...current, version: saved.version }));
      onSaved?.(saved); onClose();
    } catch (error) { if (activeCue.current === savingCueId) setError(error.message || '저장하지 못했습니다. 입력한 내용은 유지됩니다.'); }
    finally { if (activeCue.current === savingCueId) setBusy(false); }
  }
  return <section className="show-editor" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <header><div><h2 id={`${id}-heading`}>대본·화면 문구 편집</h2><p>저장하면 Mac 출력과 연결된 컨트롤러에 반영됩니다.</p></div></header>
    {error && <p className="show-editor-error" role="alert">{error}</p>}
    {!draft ? <><p role="status">{error ? '편집기를 닫고 다시 열어 주세요.' : '편집 내용을 불러오는 중…'}</p><button type="button" onClick={onClose}>닫기</button></> :
      <form onSubmit={save}><fieldset disabled={busy}>
        <label htmlFor={`${id}-label`}>큐 이름</label><input id={`${id}-label`} value={draft.label} required maxLength={200} onChange={e => setDraft({ ...draft, label: e.target.value })}/>
        <div className="show-editor-group"><h3>발표 대본</h3><p>문단별로 수정하세요. 대본은 관객 화면에 표시되지 않습니다.</p>
          {draft.script.map((paragraph, index) => <div className="show-editor-field" key={index}><label htmlFor={`${id}-script-${index}`}>문단 {index + 1}</label><textarea id={`${id}-script-${index}`} value={paragraph} maxLength={4000} rows={4} onChange={e => setDraft({ ...draft, script: draft.script.map((value, i) => i === index ? e.target.value : value) })}/><button type="button" onClick={() => setDraft({ ...draft, script: draft.script.filter((_, i) => i !== index) })} aria-label={`대본 문단 ${index + 1} 삭제`}>문단 삭제</button></div>)}
          <button type="button" disabled={draft.script.length >= 100} onClick={() => setDraft({ ...draft, script: [...draft.script, ''] })}>문단 추가</button>
        </div>
        <div className="show-editor-group"><h3>관객 화면 문구</h3>
          {draft.type === 'html' ? <><p>서식이 나뉜 문구는 각각 표시됩니다. 글자 수가 늘어나면 관객 화면의 줄바꿈을 확인하세요.</p>{draft.fields.length === 0 && <p>이 화면에는 직접 수정할 수 있는 문구가 없습니다.</p>}{draft.fields.map((field, index) => <div className="show-editor-field" key={field.index}><label htmlFor={`${id}-text-${field.index}`}>{field.role} {index + 1}</label><p className="show-editor-original">원문: {field.original}</p><textarea id={`${id}-text-${field.index}`} rows={2} maxLength={2000} value={field.value} onChange={e => setDraft({ ...draft, fields: draft.fields.map(item => item.index === field.index ? { ...item, value: e.target.value } : item) })}/></div>)}</> : <p>{draft.type === 'slide' ? '이 슬라이드는 이미지입니다. 화면 속 글자를 바꾸려면 원본 슬라이드를 수정한 뒤 이미지를 교체해야 합니다.' : '이 큐는 관객 화면 문구를 직접 수정할 수 없습니다. 발표 대본과 큐 이름을 수정할 수 있습니다.'}</p>}
        </div>
        <div className="show-editor-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" className="primary">{busy ? '저장 중…' : '저장하고 반영'}</button></div>
      </fieldset></form>}
  </section>;
}
