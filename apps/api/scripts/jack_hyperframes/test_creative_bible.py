import unittest
from creative_bible import contrast, validate_art, plan, CREATIVE, ART

class BibleTests(unittest.TestCase):
    def setUp(self):
        self.art=dict(background="#101827",foreground="#FFFFFF",accent="#FFAA55",secondary="#7299CC",typography="editorial",composition="central subject",materials="matte",lighting="soft key",caption_rule="clear lower area",asset_rule="verified only")
    def test_valid_palette(self):
        validate_art(self.art)
    def test_invalid_hex(self):
        self.art["accent"]="orange"
        with self.assertRaises(ValueError): validate_art(self.art)
    def test_duplicate_color(self):
        self.art["secondary"]=self.art["foreground"]
        with self.assertRaises(ValueError): validate_art(self.art)
    def test_low_text_contrast(self):
        self.art["foreground"]="#202020"
        with self.assertRaises(ValueError): validate_art(self.art)
    def test_low_accent_contrast(self):
        self.art["accent"]="#202020"
        with self.assertRaises(ValueError): validate_art(self.art)
    def test_contrast(self):
        self.assertAlmostEqual(contrast("#000000","#FFFFFF"),21)
    def test_shared_contract(self):
        calls=[]
        def structured(client,prompt,data,schema,check):
            calls.append(data)
            value={k:"specific direction" for k in CREATIVE["properties"]} if schema==CREATIVE else self.art
            check(value)
            return value
        bible=plan(None,structured,"Explain AI",{"beat_00":{"subject":"model"}})
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[1]["creative"],bible["creative"])
        self.assertEqual(bible["execution"]["palette"],"planned_not_applied")
if __name__=="__main__":
    unittest.main()
