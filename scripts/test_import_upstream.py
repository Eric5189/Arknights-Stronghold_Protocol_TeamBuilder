import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from import_upstream import extract_abilities, find_season, install, parse_trait, plain_text


class ImportTests(unittest.TestCase):
    def test_preserves_semantic_markers(self):
        self.assertEqual(plain_text('<休整期结束时>层数<@ba.vup>+12</>\\n下一行'),
                         '<休整期结束时>层数+12\n下一行')

    def test_layer_milestones_are_not_headcount_tiers(self):
        result = parse_trait({
            'bondId': 'victoriaShip', 'name': '维多利亚', 'activeCount': 3,
            'desc': '基础效果\n<每叠加25层>获得装备\n<在场6名不同【维多利亚】干员>进阶效果',
        })
        self.assertEqual(result['thresholds'], [3, 6])
        self.assertIn('<每叠加25层>', result['effects'][0])
        self.assertTrue(result['effects'][1].startswith('<在场6名不同'))

    def test_headcount_without_different_word(self):
        result = parse_trait({'bondId': 'docShip', 'name': '聚合', 'activeCount': 2,
                              'desc': '基础效果\n<在场3名【聚合】干员>庇护'})
        self.assertEqual(result['thresholds'], [2, 3])

    def test_solo_is_not_a_second_tier(self):
        result = parse_trait({'bondId': 'soloShip', 'name': '独行', 'activeCount': 1,
                              'desc': '<在场1名【独行】干员>提升（在场2名及以上时失效）'})
        self.assertEqual(result['thresholds'], [1])
        self.assertEqual(result['special'], 'solo')

    def test_keeps_multiple_abilities_and_internal_metadata(self):
        garrisons = {
            'a': {'garrisonDesc': '<获得时>获得资金', 'eventType': 'GAIN'},
            'b': {'garrisonDesc': '<获得时>获得资金', 'eventType': 'GAIN'},
            'c': {'garrisonDesc': '<战斗中>增加层数', 'eventType': 'BATTLE'},
            'd': {'garrisonDesc': None, 'effectType': 'GAIN_BUFF'},
        }
        result = extract_abilities({'garrisonIds': ['a', 'b', 'c', 'd']}, garrisons)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['sourceIds'], ['a', 'b'])
        self.assertEqual(result[1]['triggers'], ['战斗中'])
        self.assertIsNone(result[2]['text'])
        self.assertEqual(result[2]['effectType'], 'GAIN_BUFF')

    def test_new_and_historical_season_paths(self):
        payload = {'charChessDataDict': {}}
        for category, entry in [('AUTOCHESS', {'V3_1': payload}),
                                ('AUTOCHESS_SEASON', payload)]:
            data = {'activity': {category: {'season': entry}}}
            result, _ = find_season(data, 'season', 'V3_1')
            self.assertIs(result, payload)
        with self.assertRaisesRegex(ValueError, 'Version'):
            find_season({'activity': {'AUTOCHESS': {'season': {'V3_2': payload}}}},
                        'season', 'V3_1')

    def test_install_archives_both_old_files_and_preserves_legacy(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            root = Path(folder)
            (root / 'data' / 'legacy').mkdir(parents=True)
            (root / 'data' / 'legacy' / 'traits.json').write_text('historic')
            output = root / 'generated'
            output.mkdir()
            for name in ('operators.json', 'traits.json'):
                (root / 'data' / name).write_text('old-' + name)
                (output / name).write_text('new-' + name)
            with patch('import_upstream.ROOT', root):
                archive = install(output, 'act3autochess', 'V3_1')
            for name in ('operators.json', 'traits.json'):
                self.assertEqual((archive / name).read_text(), 'old-' + name)
                self.assertEqual((root / 'data' / name).read_text(), 'new-' + name)
            self.assertEqual((root / 'data' / 'legacy' / 'traits.json').read_text(), 'historic')


if __name__ == '__main__':
    unittest.main()
