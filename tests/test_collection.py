import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from collection import Collection,write_table


def study(root):
    root.mkdir()
    rows=[dict(measurement=f'S-1_{i}',specimen='S-1',experiment='S-1_T',timestamp=f'2000-01-01T12:0{i}:00',treat_temp=str(773.15+i*10),magn_moment=str(1e-8*(1-.15*i)),dir_dec=str(10+2*i),dir_inc=str(30+i),dir_csd='1',quality='g',method_codes='LT-T-Z:LP-DIR-T',sequence=str(i),standard='u',meas_temp='273.15') for i in range(5)]
    write_table(root/'measurements.txt',rows,'measurements')
    write_table(root/'specimens.txt',[dict(specimen='S-1',sample='S-1')],'specimens')
    write_table(root/'samples.txt',[dict(sample='S-1',site='S',azimuth='0',dip='0',bed_dip='0',bed_dip_direction='0')],'samples')
    write_table(root/'sites.txt',[dict(site='S',location='Example',lat='0',lon='0')],'sites')
    write_table(root/'locations.txt',[dict(location='Example',lat_n='0',lat_s='0',lon_e='0',lon_w='0')],'locations')
    component=dict(specimen='S-1',name='HT',fit_type='DE-BFL',quality='g',imin=0,imax=4,min=dict(measurement='S-1_0',value=773.15,unit='K'),max=dict(measurement='S-1_4',value=813.15,unit='K'))
    (root/'pmagpy_directions_autosave.json').write_text(json.dumps({'components':[component]}))


class CollectionTests(unittest.TestCase):
    def test_multiple_studies_source_bound_decisions_and_combined_export(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);a=base/'one';b=base/'two';study(a);study(b)
            c=Collection(base/'state');bundle=c.set_directories([str(a),str(b)])
            self.assertEqual(len(bundle['fits']),2);first,second=bundle['fits']
            self.assertNotEqual(first['id'],second['id']);self.assertNotEqual(first['context_key'],second['context_key'])
            self.assertEqual(first['bounds_C'],[500,540])
            self.assertEqual(first['window_observations'],second['window_observations'])
            original=(a/'measurements.txt').read_bytes()
            with self.assertRaisesRegex(ValueError,'changed'):c.save_choice(dict(id=first['id'],fingerprint='wrong',status='keep'))
            for f in bundle['fits']:c.save_choice(dict(id=f['id'],fingerprint=f['fingerprint'],status='keep'))
            result=c.export_kept();out=Path(result['directory']);self.assertEqual(result['kept'],2)
            session=json.loads((out/'pmagpy_directions_autosave.json').read_text());self.assertEqual(len(session['components']),2)
            names={x['specimen'] for x in session['components']};self.assertEqual(names,{'01_one__S-1','02_two__S-1'})
            self.assertEqual((a/'measurements.txt').read_bytes(),original)
            self.assertTrue(out.with_suffix('.zip').exists())
            c.save_choice(dict(id=first['id'],fingerprint=first['fingerprint'],status='reject'))
            self.assertEqual(c.export_kept()['kept'],1)

    def test_invalid_folder_does_not_replace_collection(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);study(base/'valid');c=Collection(base/'state');c.set_directories([str(base/'valid')])
            with self.assertRaises(ValueError):c.set_directories([str(base/'missing')])
            self.assertEqual(len(c.roots),1)

    def test_redo_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);study(base/'source');c=Collection(base/'state');c.set_directories([str(base/'source')])
            f=c.bundle()['fits'][0];c.save_choice(dict(id=f['id'],fingerprint=f['fingerprint'],status='keep'))
            out=Path(c.export_kept()['directory']);(out/'pmagpy_directions_autosave.json').unlink()
            other=Collection(base/'state2');self.assertEqual(len(other.set_directories([str(out)])['fits']),1)

    def test_specimens_table_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);study(base/'source');c=Collection(base/'state');c.set_directories([str(base/'source')])
            f=c.bundle()['fits'][0];c.save_choice(dict(id=f['id'],fingerprint=f['fingerprint'],status='keep'))
            out=Path(c.export_kept()['directory']);(out/'pmagpy_directions_autosave.json').unlink();(out/'pmagpy_directions.redo').unlink()
            other=Collection(base/'state2');self.assertEqual(len(other.set_directories([str(out)])['fits']),1)

if __name__=='__main__':unittest.main()
