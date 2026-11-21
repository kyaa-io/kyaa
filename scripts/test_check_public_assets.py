import os
from pathlib import Path
from subprocess import CompletedProcess
import tempfile
import unittest

from check_public_assets import check, collect


class AssetCheck(unittest.TestCase):
    def test_collection(self):
        with tempfile.TemporaryDirectory() as folder:
            previous = os.getcwd()
            os.chdir(folder)
            self.addCleanup(os.chdir, previous)
            app = Path("apps/web/page.tsx")
            app.parent.mkdir(parents=True)
            app.write_text('<SceneVideo src="/public-assets/video" />')
            seed = Path("cms-seed.sql")
            seed.write_text("'/public-assets/photo.png?size=2'")
            packaged = Path("apps/web/public/public-assets/banner.webm")
            self.assertEqual(collect([app, seed, packaged]), [
                "public-assets/banner.webm", "public-assets/photo.png",
                "public-assets/video.mp4", "public-assets/video.webm"])

    def test_bucket(self):
        def head(*args):
            error = {"present": "", "hidden": "(403)", "missing": "(404)"}[args[-1]]
            return CompletedProcess(args, int(bool(error)), "", error)
        self.assertFalse(check("fake", ["present", "hidden"], head))
        self.assertTrue(check("fake", ["hidden", "missing"], head))
