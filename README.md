# Pmag fit review

A local browser app for reviewing and consolidating **thermal demagnetization fits** from one or more MagIC folders. Compare saved windows, methods, directions, MAD/DANG, and overlapping interpretations. Keep/reject/undecided decisions and notes autosave locally. Nothing uploads to a service, and source studies are never overwritten.

## Start

Requires Python 3.10+ and the current PmagPy demagnetization APIs. The requirements file pins a tested upstream revision; it installs PmagPy and its scientific dependencies.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python review.py
```

Open the printed `http://127.0.0.1:8770/` link. Expand **MagIC directories**, paste one full local folder path per line, and click **Load these directories**. Edit the list to add/remove studies. Alternatively:

```sh
python review.py --directory /path/to/study-one --directory /path/to/study-two
```

Each folder needs MagIC 3 `measurements.txt` and `specimens.txt`. Include `samples.txt`, `sites.txt`, and `locations.txt` for hierarchy/orientation metadata. Fits load from `pmagpy_directions_autosave.json`, then `pmagpy_directions.redo`, then directional rows in `specimens.txt`. Geographic/tilt views require the corresponding orientation metadata. This initial release supports thermal directional data; AF data are rejected rather than mislabeled as temperature. Celsius uses a 273.15 K offset.

## Review and combine

- Arrow keys browse; **Y** keeps, **N** rejects, **U** leaves undecided. **Enter** confirms; **Esc** reassesses.
- Click another fit card to inspect its source data and window. Positive temperature-window overlap identifies comparison candidates; it never merges/ranks them automatically. Non-overlapping windows appear under **Other components**. Shared-good-observation counts use timestamps where available; without timestamps, cross-folder identity is not assumed.
- Gold shows the measured treatment window, **not a fitted PCA line**. Statistics are calculated by PmagPy with the saved fitting method and effective session flags. MAD colors are screening aids, not universal acceptance criteria.
- **Export combined kept fits** writes a separate MagIC study and downloads a ZIP. Only explicitly kept, unchanged-source fits are included. Undecided/rejected fits are withheld.

Every source receives a folder prefix on measurement/specimen/sample/site/location identifiers in the combined export. Similarly named records from different studies remain distinct, including conflicting versions of the same specimen. This is deliberate: no automatic specimen-identity reconciliation, averaging, repeat selection, or site/pole calculation occurs. Provenance records the original folder and fit. Do not count multiple source versions as independent physical specimens in later analyses.

## Local state and portability

Directories and decisions live in `~/.local/share/pmag-fit-review/`, with decision backups and separate exports. Use `--state-dir /another/path` for an isolated collection. Source changes require renewed confirmation. Notes do not undo keep/reject choices. Local paths can appear in your exported provenance; inspect it before sharing a study. No research data, credentials, or user-specific paths are bundled in this repository.

The server binds only to `127.0.0.1`, checks browser origin/host, and requires a per-run token for API calls. This is a personal desktop tool, not a shared remote server. Changing `--port` does not enable remote access.

## Development

```sh
python -m unittest discover -s tests
node tests/test_ui.js
```

`lib/` contains MagIC loading, decisions, and export; `templates/` contains the interface and shared paleomagnetic plots. Synthetic tests cover multi-folder collisions, source-bound choices, export, and native-session/redo loading. Sources and fitting methods are preserved; this app selects saved windows and does not optimize new fits. MIT licensed; shared plots originate in [pmag_measurement_review](https://github.com/polomski-mit/pmag_measurement_review). PmagPy remains a separate dependency under its own license.
