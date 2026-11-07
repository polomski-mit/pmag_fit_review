"""Local multi-directory fit review. Source studies are never written."""
import copy
import csv
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile
from dataset import dataset_bundle, table


def save_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n');temporary.replace(path)


def write_table(path,rows,kind):
    headers=list(dict.fromkeys(k for r in rows for k in r))
    with path.open('w',newline='') as stream:
        stream.write('tab\t'+kind+'\n');writer=csv.DictWriter(stream,headers,delimiter='\t');writer.writeheader();writer.writerows(rows)


class Collection:
    def __init__(self,state):
        self.state=Path(state);self.config=self.state/'directories.json';self.decisions=self.state/'decisions.json'
        self.roots=[Path(p) for p in json.loads(self.config.read_text())] if self.config.exists() else []

    def set_directories(self,paths):
        if not isinstance(paths,list) or not all(isinstance(p,str) for p in paths):raise ValueError('Provide a list of directory paths.')
        roots=list(dict.fromkeys(Path(p).expanduser().resolve() for p in paths if p.strip()))
        if len(roots)>30:raise ValueError('Load at most 30 directories at once.')
        for root in roots:
            if not root.is_dir() or not (root/'measurements.txt').is_file() or not (root/'specimens.txt').is_file():raise ValueError(f'{root}: measurements.txt and specimens.txt are required.')
            dataset_bundle(root,{}) # Validate before replacing an existing collection.
        self.roots=roots;save_json(self.config,[str(r) for r in roots]);return self.bundle()

    def bundle(self):
        saved=json.loads(self.decisions.read_text()) if self.decisions.exists() else {}
        fits=[];context={};datasets=[];issues=[]
        for index,root in enumerate(self.roots,1):
            source_id=hashlib.sha256(str(root).encode()).hexdigest()[:16]
            label=f'{index:02d}_{re.sub(r"[^a-zA-Z0-9_-]","_",root.name) or "study"}'
            local={k[len(source_id)+1:]:v for k,v in saved.items() if k.startswith(source_id+'|')}
            data=dataset_bundle(root,local)
            datasets.append(dict(id=source_id,label=label,directory=str(root),fits=len(data['fits'])))
            for specimen,rows in data['context'].items():
                for row in rows:
                    row['observation_id']=specimen+'|'+(row['timestamp']+'|'+str(row['treat_temp']) if row.get('timestamp') else source_id+'|'+row['measurement'])
                context[source_id+'|'+specimen]=rows
            for fit in data['fits']:
                fit['local_id']=fit['id'];fit['id']=source_id+'|'+fit['id'];fit['dataset_id']=source_id;fit['dataset_label']=label;fit['context_key']=source_id+'|'+fit['specimen']
                rows=context[fit['context_key']];ids=set(fit['window_ids'])
                fit['window_observations']=[r['observation_id'] for r in rows if r['measurement'] in ids]
                fit['good_observations']=[r['observation_id'] for r in rows if r['measurement'] in ids and r['quality']!='b']
                fits.append(fit)
            issues.extend(data['issues'])
        return dict(directory=f'{len(datasets)} local MagIC directories',datasets=datasets,fits=fits,context=context,issues=issues)

    def save_choice(self,value):
        if value.get('status') not in {'keep','reject','undecided'}:raise ValueError('Invalid review status.')
        fit=next((f for f in self.bundle()['fits'] if f['id']==value.get('id')),None)
        if fit is None or fit['fingerprint']!=value.get('fingerprint'):raise ValueError('Source fit changed; reload before reviewing.')
        saved=json.loads(self.decisions.read_text()) if self.decisions.exists() else {}
        if self.decisions.exists():save_json(self.state/'backups'/(datetime.now().strftime('%Y%m%d_%H%M%S_%f')+'.json'),saved)
        status=saved.get(fit['id'],{}).get('status','undecided') if value.get('note_only') else value['status']
        saved[fit['id']]=dict(status=status,note=str(value.get('note',''))[:10000],fingerprint=fit['fingerprint'],updated_at=datetime.now().isoformat())
        save_json(self.decisions,saved);return dict(saved=True,decision=saved[fit['id']])

    def export_kept(self):
        data=self.bundle();kept=[f for f in data['fits'] if f['decision'].get('status')=='keep']
        if not kept:raise ValueError('Mark at least one fit Keep before exporting.')
        export_id=datetime.now().strftime('%Y%m%d_%H%M%S_%f');out=self.state/'exports'/export_id;out.mkdir(parents=True)
        merged={k:[] for k in ['measurements','specimens','samples','sites','locations']};components=[];audit=[]
        for source in data['datasets']:
            selected=[f for f in kept if f['dataset_id']==source['id']]
            if not selected:continue
            root=Path(source['directory']);prefix=source['label']+'__'
            # Explicit source namespaces keep unrelated or conflicting identifiers distinct.
            def rename(row):
                row=dict(row)
                for key in ['measurement','experiment','specimen','sample','site','location']:
                    if row.get(key):row[key]=prefix+row[key]
                for key in ['measurements','specimens','samples','sites']:
                    if row.get(key):row[key]=':'.join(prefix+x for x in row[key].split(':') if x)
                return row
            local=dataset_bundle(root,{})
            for kind in merged:
                rows=table(root/(kind+'.txt'))
                if kind!='measurements':
                    entity=kind[:-1] if kind!='specimens' else 'specimen'
                    base={}
                    for record in sorted(rows,key=lambda r:bool(r.get('dir_dec'))):
                        identity=record[entity]
                        row={k:v for k,v in record.items() if not k.startswith(('dir_','vgp_','pole_','meas_step_','result_'))}
                        if 'method_codes' in row:row['method_codes']=':'.join(code for code in row['method_codes'].split(':') if not code.startswith(('DE-','LP-DIR','DA-DIR')))
                        if identity not in base:base[identity]=row
                        else:
                            for k,v in row.items():
                                if not base[identity].get(k):base[identity][k]=v
                    rows=list(base.values())
                merged[kind].extend(rename(r) for r in rows)
            for fit in selected:
                c=copy.deepcopy(fit['component']);c['specimen']=prefix+c['specimen']
                for bound in ['min','max']:c[bound]['measurement']=prefix+c[bound]['measurement']
                components.append(c);audit.append(dict(source=source,fit_id=fit['id'],compiled_specimen=c['specimen'],decision=fit['decision'],fingerprint=fit['fingerprint']))
            # Effective native-session flags, rather than stale exported table flags.
            effective={r['measurement']:r['quality'] for rows in local['context'].values() for r in rows}
            for row in merged['measurements']:
                if row['measurement'].startswith(prefix):row['quality']=effective[row['measurement'][len(prefix):]]
        for sequence,row in enumerate(merged['measurements'],1):row['sequence']=str(sequence)
        for kind,rows in merged.items():
            if rows:write_table(out/(kind+'.txt'),rows,kind)
        from pmagpy.demag import DemagData
        study=DemagData.from_directory(str(out));study.components_from_json(json.dumps({'components':components}))
        if len(study.components)!=len(components):raise ValueError('Export lost fit windows; originals are unchanged.')
        study.write_specimens(str(out));study.save_components(str(out/'pmagpy_directions_autosave.json'));study.write_redo(str(out/'pmagpy_directions.redo'))
        save_json(out/'fit_review_provenance.json',audit)
        (out/'README.md').write_text('# Combined reviewed fits\n\nOnly explicitly kept source-matching fits are included. Each source study has a dataset prefix on specimen/sample/site/location/measurement identifiers; matching specimen names across folders are not silently merged. This protects conflicting observations and preserves saved windows. Source files are untouched. No combined means or poles were calculated. Directions are recalculated using the original methods and source-session quality flags. Provenance lists sources and original fit identities.\n')
        archive=Path(shutil.make_archive(str(out),'zip',out))
        return dict(directory=str(out),export_id=export_id,kept=len(kept),withheld=len(data['fits'])-len(kept),download='/api/download/'+export_id)
