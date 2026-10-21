import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare_assets', Path(__file__).with_name('prepare-assets.py'))
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class PreparationTests(unittest.TestCase):
    def titles(self):
        return [[title] for title in assets.TITLES.values()]

    def test_titles_follow_reordered_deck_and_reject_missing_duplicate(self):
        titles = self.titles()[::-1]
        self.assertEqual(assets.map_slides(titles)['reception'], len(titles))
        with self.assertRaisesRegex(ValueError, 'found 0'):
            assets.map_slides(titles[:-1])
        with self.assertRaisesRegex(ValueError, 'found 2'):
            assets.map_slides(titles + [titles[0]])

    def test_exact_cue_sequence_and_original_speech(self):
        slides = [dict(title=f'Title {i}',speech=[f'original {i}'],time='source time') for i in range(1,17)]
        cues = assets.make_cues(assets.map_slides(self.titles()),slides)
        ids = [c['id'] for c in cues]
        self.assertEqual(ids, ['reception','dinner','opening','agenda','welcome','company','intro'] +
            [f'pre-{i:02}' for i in range(1,6)] + ['standby-06','live-talk','live-performance','buffer-07'] +
            [f'post-{i:02}' for i in range(7,17)] + ['na-pd','qa','relay','quiz','groupwork','photo','thanks','party','raffle','closing'])
        self.assertEqual(cues[6]['nextOnEnd'], 'pre-01')
        self.assertEqual(next(c for c in cues if c['id'] == 'post-07')['script'], ['original 7'])
        self.assertEqual(next(c for c in cues if c['id'] == 'na-pd')['label'], 'SESSION 02 · 나영석 PD')
        self.assertTrue(all(c['script'] == [] for c in cues if c['type'] == 'hold'))
        self.assertEqual(len(ids), len(set(ids)))

    def test_adapter_is_idempotent_and_original_script_preserved(self):
        import json
        source = '<html><body><script id="slideData" type="application/json">' + json.dumps([{'speech': ['raw']}]*16) + '</script><script>function showSlide(i) {}</script></body></html>'
        once, slides = assets.adapt_html(source)
        twice, _ = assets.adapt_html(once)
        self.assertEqual(twice.count(assets.ADAPTER_START), 1)
        self.assertEqual(slides[0]['speech'], ['raw'])
        self.assertIn('function showSlide(i) {}', once)
        self.assertIn('event.source !== parent', once)
        self.assertIn('event.origin !== location.origin', once)
        self.assertIn('showSlide(message.index)', once)

    def test_atomic_publish_excludes_existing_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pending = root/'pending'; pending.mkdir(); (pending/'manifest.json').write_text('new')
            active = root/'active'; active.mkdir()
            with self.assertRaises(OSError): assets.publish_bundle(pending,active)
            self.assertTrue((pending/'manifest.json').exists())
            self.assertEqual(list(active.iterdir()), [])
            assets.publish_bundle(pending,root/'new-revision')
            self.assertEqual((root/'new-revision/manifest.json').read_text(),'new')

    def test_existing_bundle_never_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'; source.write_text('original')
            out = root / 'show'; out.mkdir(); marker = out / 'keep'; marker.write_text('keep')
            with self.assertRaises(FileExistsError): assets.prepare(source,source,source,out)
            self.assertEqual(marker.read_text(),'keep')

    def test_conversion_failure_leaves_no_published_bundle(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'; source.write_text('<html><body><script id="slideData" type="application/json">' + json.dumps([{'speech': []}]*16) + '</script><script>function showSlide(i) {}</script></body></html>')
            with patch.object(assets, 'slide_titles', return_value=self.titles()), patch.object(assets, 'export_pdf', side_effect=RuntimeError('failed')):
                with self.assertRaises(RuntimeError): assets.prepare(source,source,source,root/'show')
            self.assertFalse((root/'show').exists())
            self.assertEqual(source.read_text()[:6],'<html>')


if __name__ == '__main__': unittest.main()
