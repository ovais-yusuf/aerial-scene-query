"""Paper-aligned framewise pixel-space export. Python 3.9+, standard library only.
Usage: python build_metric_graphs.py grid_source.json new_output_directory
No detection/tracking rerun. Strict d < rho. No physical certification.
"""
import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path


def cell_gap(a, b, cw, ch):
    return math.hypot(max(0, abs(a[1]-b[1])-1)*cw,
                      max(0, abs(a[0]-b[0])-1)*ch)


def analyze(points, rows, cols, width, height, rho, frame_id):
    n = len(points); cw, ch = width/cols, height/rows
    if any(not math.isfinite(v) for p in points for v in p):
        raise ValueError('Nonfinite point')
    if any(not (0 <= x <= width and 0 <= y <= height) for x,y in points):
        raise ValueError('Point outside video; refusing to silently clamp geometry')
    cells = [(min(rows-1,int(y/ch)), min(cols-1,int(x/cw))) for x,y in points]
    buckets = {}
    for i,c in enumerate(cells): buckets.setdefault(c,[]).append(i)
    D = [[0.0]*n for _ in points]
    for a,b in itertools.combinations(range(n),2):
        D[a][b] = D[b][a] = math.dist(points[a],points[b])
    A = [[int(a!=b and D[a][b]<rho) for b in range(n)] for a in range(n)]
    oracle = {(a,b) for a,b in itertools.combinations(range(n),2) if D[a][b]<rho}
    candidates=[]; local=set(); eligible=[]
    occupied=sorted(buckets)
    for k,c in enumerate(occupied):
        for e in occupied[k:]:
            gap=cell_gap(c,e,cw,ch)
            if gap>=rho: continue
            eligible.append({'cell_a':list(c),'cell_b':list(e),'set_distance_px':gap})
            pairs=itertools.combinations(buckets[c],2) if c==e else itertools.product(buckets[c],buckets[e])
            for a,b in pairs:
                a,b=sorted((a,b)); candidates.append((a,b))
                # Independent metric evaluation by localized algorithm, not lookup in D.
                if math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1])<rho:
                    local.add((a,b))
    if len(candidates)!=len(set(candidates)) or local!=oracle:
        raise ValueError('Localized search differs from all-pairs or generates duplicate pairs')
    components=[]; unseen=set(range(n))
    while unseen:
        seed=min(unseen); unseen.remove(seed); todo=[seed]; comp=[]
        while todo:
            a=todo.pop(); comp.append(a)
            nxt=[b for b in sorted(unseen) if A[a][b]]
            unseen.difference_update(nxt); todo.extend(nxt)
        components.append(sorted(comp))
    component_of={a:k for k,comp in enumerate(components) for a in comp}
    degrees=[sum(row) for row in A]
    labels=[f'f{frame_id:04d}_d{i:03d}' for i in range(n)]
    edges=[{'a':a,'b':b,'distance_px':D[a][b],
            'threshold_depth_px':rho-D[a][b],'cross_cell':cells[a]!=cells[b]}
           for a,b in sorted(oracle)]
    nearest=min((D[a][b] for a,b in itertools.combinations(range(n),2)),default=None)
    C=[]
    for rr in range(rows):
        row=[]
        for cc in range(cols):
            ids=buckets.get((rr,cc),[])
            row.append({'count':len(ids),'detection_indices':ids,'labels':[labels[i] for i in ids],
                        'distance_matrix_px':[[D[a][b] for b in ids] for a in ids],
                        'proximity_matrix':[[A[a][b] for b in ids] for a in ids]})
        C.append(row)
    cross=[e for e in edges if e['cross_cell']]
    return {
        'processed_frame':frame_id,
        'nodes':[{'index':i,'label':labels[i],'foot_xy_px':points[i],'cell':list(cells[i]),
                  'degree':degrees[i],'in_alert':bool(degrees[i]),'component_id':component_of[i]}
                 for i in range(n)],
        'matrix_axis_labels':labels,'distance_matrix_px':D,'adjacency_matrix':A,
        'laplacian_matrix':[[degrees[a] if a==b else -A[a][b] for b in range(n)] for a in range(n)],
        'C':C,'occupancy_matrix':[[c['count'] for c in row] for row in C],
        'edges':edges,'cross_cell_edges':cross,
        'components':[{'component_id':k,'detection_indices':comp,'size':len(comp),
                       'edge_count':sum(A[a][b] for a,b in itertools.combinations(comp,2)),
                       'is_clique':all(A[a][b] for a,b in itertools.combinations(comp,2))}
                      for k,comp in enumerate(components)],
        'summary':{'detections':n,'frame_alarm':bool(edges),'close_pairs':len(edges),
                   'within_cell_close_pairs':len(edges)-len(cross),'cross_cell_close_pairs':len(cross),
                   'people_in_alert':sum(v>0 for v in degrees),'component_count_including_isolates':len(components),
                   'nontrivial_component_count':sum(len(c)>1 for c in components),
                   'largest_component_size':max(map(len,components),default=0),
                   'nearest_pair_distance_px':nearest,
                   'threshold_margin_px':None if nearest is None else rho-nearest,
                   'max_threshold_depth_px':0.0 if nearest is None else max(0.0,rho-nearest)},
        'search_validation':{'all_pairs_comparisons':n*(n-1)//2,'localized_comparisons':len(candidates),
                             'same_edge_set':True,'eligible_occupied_cell_pairs':eligible},
        'unavailable':{'physical_distances_m':None,'certified_pair_classification':None,
                       'persistent_pair_exposure':None,'source_timestamp_sec':None},
    }


def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('source'); p.add_argument('out'); p.add_argument('--rho',type=float)
    args=p.parse_args(); raw=Path(args.source).read_bytes(); source=json.loads(raw)
    rho=args.rho if args.rho is not None else float(source['proximity_threshold_px'])
    if not math.isfinite(rho) or rho<=0: p.error('rho must be finite and positive')
    rows,cols=source['grid']; width,height=source['resolution']
    if any(not isinstance(v,int) or v<=0 for v in [rows,cols,width,height]): raise ValueError('Invalid dimensions')
    log=source['sampled_frame_log']
    if len(log)!=source['frames_processed']: raise ValueError('Incomplete frame log')
    out=Path(args.out)
    if out.exists(): raise SystemExit('Choose a new output directory')
    out.mkdir(parents=True); (out/'frames').mkdir()
    index=[]; equality=0; comparisons=local_comparisons=0
    for k,f in enumerate(log,1):
        if f['processed_frame']!=k: raise ValueError('Nonconsecutive frame indices')
        points=f['feet_xy_px']; result=analyze(points,rows,cols,width,height,rho,k)
        if len(points)!=f['people']: raise ValueError('Source count mismatch')
        counts=[[0]*cols for _ in range(rows)]
        for c in f['occupied_cells']:counts[c['row']][c['col']]=c['people']
        if counts!=result['occupancy_matrix']: raise ValueError('Source occupancy mismatch')
        old_rho=source['proximity_threshold_px']
        old_pairs={(a,b) for a,b in itertools.combinations(range(len(points)),2) if result['distance_matrix_px'][a][b]<=old_rho}
        if old_pairs!={(e['a'],e['b']) for e in f['pair_details']}: raise ValueError('Source pair mismatch')
        equality+=sum(result['distance_matrix_px'][a][b]==rho for a,b in itertools.combinations(range(len(points)),2))
        fps=source.get('output_fps')
        result['nominal_output_time_sec']=(k-1)/fps if fps and math.isfinite(fps) and fps>0 else None
        path=f'frames/frame_{k:04d}.json'
        (out/path).write_text(json.dumps(result,separators=(',',':'),allow_nan=False))
        index.append({'processed_frame':k,'path':path,'nominal_output_time_sec':result['nominal_output_time_sec'],**result['summary']})
        comparisons+=result['search_validation']['all_pairs_comparisons']; local_comparisons+=result['search_validation']['localized_comparisons']
    metadata={
      'schema_version':'2.0','paper':'A Metric-Graph Framework for Exact and Robust Threshold Proximity Detection in Discrete-Time Video Observations',
      'scope':'Framewise pixel-space implementation; not physical or uncertainty-certified detection',
      'source_sha256':hashlib.sha256(raw).hexdigest(),'source_metadata':{k:v for k,v in source.items() if k!='sampled_frame_log'},
      'threshold_px':rho,'threshold_operator':'<','grid_shape':[rows,cols],
      'conventions':{'cell_and_detection_index_base':0,'processed_frame_index_base':1,
        'identities':'Frame-local detections only; component IDs also frame-local',
        'matrix_order':'matrix_axis_labels for global matrices; cell labels for within-cell matrices',
        'empty_singleton':'Empty matrix []; singleton distance [[0.0]], adjacency [[0]]',
        'no_pair':'nearest_pair_distance_px and threshold_margin_px are null when fewer than 2 detections; paper uses +infinity for nearest distance. Alarm false; max depth 0 by convention.',
        'cells':'Rectangles width=W/cols, height=H/rows; floor assignment; final boundary assigned to final cell. Out-of-frame points rejected.',
        'search':'Exact rectangle set-distance = hypot(max(0,abs(delta_col)-1)*cell_width, max(0,abs(delta_row)-1)*cell_height); retain if <rho',
        'time':'Nominal output playback time only; actual original frame indices/timestamps unavailable',
        'components':'Connected components include isolates; nontrivial components have >=2 nodes. Connected does not imply all pairs are close.',
        'severity':'max(0,rho-nearest_distance) in pixels, threshold depth only, not validated danger',
        'counts':'Summed edges across frames are repeated pair observations, not distinct events'},
      'unavailable_reasons':{'physical_calibration':'No ground reference correspondences or calibration map',
        'uncertainty_certification':'No justified deterministic localization-error bounds; confidence is not an error bound',
        'temporal_exposure':'No persistent identities or source timestamps',
        'sampling_guarantee':'No defensible pairwise motion bounds or measured sampling gaps'},
      'source_unchanged':True,'detections_corrected':False,
      'paper_mapping':{'2.2':'distance_matrix_px','2.7':'C[row][col].count and distance_matrix_px','3.3':'adjacency_matrix','3.4':'summary.frame_alarm','3.6':'summary.close_pairs','3.7':'nodes[].degree','3.8':'edges[].threshold_depth_px','3.9':'summary.max_threshold_depth_px','4.2':'search_validation','10.4':'components and laplacian_matrix'},
      'summary':{'frames':len(index),'cell_records':len(index)*rows*cols,'alert_frames':sum(f['frame_alarm'] for f in index),
        'within_cell_pair_observations':sum(f['within_cell_close_pairs'] for f in index),
        'cross_cell_pair_observations':sum(f['cross_cell_close_pairs'] for f in index),
        'pairs_exactly_at_threshold':equality,'all_pairs_comparisons':comparisons,'localized_comparisons':local_comparisons,
        'comparison_reduction_pct':100*(1-local_comparisons/comparisons) if comparisons else 0,
        'search_scope':'Comparison counts for standalone localized detection vs all-pairs. Export computes both for validation and full matrices; no runtime speedup claimed.'}}
    (out/'manifest.json').write_text(json.dumps(metadata,indent=2,allow_nan=False))
    (out/'frame_index.json').write_text(json.dumps(index,separators=(',',':'),allow_nan=False))
    print(json.dumps(metadata['summary'],indent=2))


if __name__=='__main__':main()
