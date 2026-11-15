"""Isolated failure-path regression for Cloudflare deploy config restoration."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class DeployConfigRestoreTest(unittest.TestCase):
    def test_failed_upload_restores_config_and_leaves_no_web_backup(self):
        source = Path(__file__).resolve().parents[1] / 'deploy/cloudflare/deploy.sh'
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'deploy/cloudflare').mkdir(parents=True)
            (root / 'web').mkdir()
            (root / 'bin').mkdir()
            shutil.copy2(source, root / 'deploy/cloudflare/deploy.sh')
            (root / 'deploy/cloudflare/wrangler.toml').write_text('name = "test"\n')
            config = root / 'web/config.js'
            original = b'const DEMO = true;\n'
            config.write_bytes(original)
            git = root / 'bin/git'
            git.write_text('#!/bin/sh\ncase "$1 $2" in\n "rev-parse --show-toplevel") echo "$TEST_ROOT";;\n "rev-parse HEAD") echo 0123456789abcdef0123456789abcdef01234567;;\n "status --porcelain") :;;\n *) exit 2;;\nesac\n')
            node = root / 'bin/node'
            node.write_text('#!/bin/sh\nexit 0\n')
            npx = root / 'bin/npx'
            npx.write_text('#!/bin/sh\ncase "$*" in\n *"deployments list"*) exit 0;;\n *" deploy "*) exit 17;;\n *) exit 2;;\nesac\n')
            for executable in (git, node, npx):
                executable.chmod(0o755)
            env = os.environ.copy()
            env.update(TEST_ROOT=str(root), PATH=str(root / 'bin') + os.pathsep + env['PATH'])
            result = subprocess.run(['bash', str(root / 'deploy/cloudflare/deploy.sh')], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 17, result.stdout + result.stderr)
            self.assertEqual(config.read_bytes(), original)
            self.assertFalse((root / 'web/config.js.bak').exists())
            self.assertEqual(sorted(p.name for p in (root / 'web').iterdir()), ['config.js'])


if __name__ == '__main__':
    unittest.main()
