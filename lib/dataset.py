"""Read-only fit comparison with durable, source-bound review decisions."""
import csv
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import shutil


def table(path):
    if not path.exists():return []
    with path.open(newline='') as stream:
        next(stream);return list(csv.DictReader(stream,delimiter='\t'))


def dataset_bundle(root, saved):
    root=Path(root)
    manifest=json.loads((root/'compilation_manifest.json').read_text()) if (root/'compilation_manifest.json').exists() else {'fits':[]}
    from pmagpy.demag import DemagData
    study=DemagData.from_directory(str(root))
    if (root/'pmagpy_directions_autosave.json').exists():study.load_components(str(root/'pmagpy_directions_autosave.json'))
    elif (root/'pmagpy_directions.redo').exists():study.read_redo(str(root/'pmagpy_directions.redo'))
    else:study.load_components_from_specimens_table()
    session=json.loads(study.components_to_json())
    components={c.key():c for c in study.components}
    measurements=table(root/'measurements.txt');context={}
    if any('AF' in r.get('method_codes','').split(':') or any(code.startswith(('LT-AF','LP-DIR-AF')) for code in r.get('method_codes','').split(':')) for r in measurements):raise ValueError('This version supports thermal directional data only; AF data are not plotted as temperature.')
    fields=['specimen','timestamp','treat_temp','dir_dec','dir_inc','magn_moment','dir_csd','quality','measurement']
    for row in measurements:context.setdefault(row['specimen'],[]).append({k:row.get(k,'') for k in fields})
    for specimen,rows in context.items():
        steps={str(r['measurement']):r for r in study.specimens[specimen].steps.to_dict('records')}
        for row in rows:
            r=steps[row['measurement']];row['quality']=str(r['quality']);row['directions']={str(code):[float(r[d]),float(r[i])] for code,d,i in [(-1,'dec_s','inc_s'),(0,'dec_g','inc_g'),(100,'dec_t','inc_t')] if math.isfinite(float(r[d])) and math.isfinite(float(r[i]))}
    provenance={(r['specimen'],r['compiled_name']):r for r in manifest['fits']}
    results={}
    for row in table(root/'specimens.txt'):
        if row.get('dir_dec'):results.setdefault((row['specimen'],row['dir_comp']),{})[row['dir_tilt_correction']]=row
    sites={r['site']:r['location'] for r in table(root/'sites.txt')}
    samples={r['sample']:r['site'] for r in table(root/'samples.txt') if not r.get('dir_dec')}
    specimen_samples={r['specimen']:r['sample'] for r in table(root/'specimens.txt') if not r.get('dir_dec')}
    fits=[]
    for component in session['components']:
        specimen=component['specimen'];name=component['name'];rows=context[specimen]
        lookup={r['measurement']:r for r in rows}
        lo=lookup[component['min']['measurement']];hi=lookup[component['max']['measurement']]
        ordered=sorted(rows,key=lambda r:(float(r['treat_temp']),r['timestamp']))
        a=next(i for i,r in enumerate(ordered) if r['measurement']==lo['measurement'])
        b=next(i for i,r in enumerate(ordered) if r['measurement']==hi['measurement'])
        window=ordered[min(a,b):max(a,b)+1]
        stats={}
        for code in [-1,0,100]:
            result=study.fit(components[(specimen,name)],code)
            if result is not None:stats[str(code)]={k:v for k,v in result.to_record().items() if not isinstance(v,float) or math.isfinite(v)}
        identity=specimen+'|'+name
        fingerprint=hashlib.sha256(json.dumps([component,window,stats],sort_keys=True).encode()).hexdigest()
        decision=saved.get(identity,{})
        changed=bool(decision and decision.get('fingerprint')!=fingerprint)
        site=study.specimens[specimen].site
        fits.append(dict(id=identity,specimen=specimen,name=name,site=site,location=study.specimens[specimen].location,
            component=component,window_ids=[r['measurement'] for r in window],
            bounds_C=[float(lo['treat_temp'])-273.15,float(hi['treat_temp'])-273.15],
            results=stats,provenance=provenance.get((specimen,name),{}),fingerprint=fingerprint,
            decision=decision if not changed else {'status':'undecided','note':decision.get('note','')},
            changed_since_review=changed))
    fits.sort(key=lambda f:(f['location'],f['site'],f['specimen'],f['name']))
    return dict(directory=str(root),fits=fits,context=context,issues=manifest.get('issues',[]),session=session)
