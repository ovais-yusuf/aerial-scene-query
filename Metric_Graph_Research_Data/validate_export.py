"""Run: python validate_export.py data. Includes synthetic boundary tests."""
import itertools
import json
import math
import sys
from pathlib import Path
from build_metric_graphs import analyze


def check(f,rho):
    nodes=f['nodes']; n=len(nodes); D=f['distance_matrix_px']; A=f['adjacency_matrix']; L=f['laplacian_matrix']
    assert all(len(M)==n and all(len(row)==n for row in M) for M in [D,A,L])
    edges=set()
    for a in range(n):
        assert D[a][a]==A[a][a]==0
        for b in range(n):
            p,q=nodes[a]['foot_xy_px'],nodes[b]['foot_xy_px']
            distance=math.sqrt((p[0]-q[0])**2+(p[1]-q[1])**2)
            assert math.isclose(D[a][b],distance,rel_tol=1e-12,abs_tol=1e-12)
            assert D[a][b]==D[b][a] and A[a][b]==A[b][a]
            assert A[a][b]==int(a!=b and distance<rho)
            assert L[a][b]==(sum(A[a]) if a==b else -A[a][b])
            if a<b and A[a][b]:edges.add((a,b))
        assert sum(L[a])==0 and nodes[a]['degree']==sum(A[a])
    assert edges=={(e['a'],e['b']) for e in f['edges']}
    # Independently recover components using disjoint sets instead of export DFS.
    parent=list(range(n))
    def find(a):
        while parent[a]!=a:a=parent[a]
        return a
    for a,b in edges:parent[find(a)]=find(b)
    groups={}
    for a in range(n):groups.setdefault(find(a),set()).add(a)
    assert {frozenset(c['detection_indices']) for c in f['components']}=={frozenset(v) for v in groups.values()}
    for c in f['components']:
        ids=c['detection_indices']
        assert c['size']==len(ids)
        assert c['edge_count']==sum((min(a,b),max(a,b)) in edges for a,b in itertools.combinations(ids,2))
        assert c['is_clique']==(c['edge_count']==len(ids)*(len(ids)-1)//2)
    assigned=[]
    for rr,row in enumerate(f['C']):
        for cc,c in enumerate(row):
            ids=c['detection_indices']; assigned+=ids
            assert c['count']==len(ids)==f['occupancy_matrix'][rr][cc]
            assert all(nodes[i]['cell']==[rr,cc] for i in ids)
            assert c['distance_matrix_px']==[[D[a][b] for b in ids] for a in ids]
            assert c['proximity_matrix']==[[A[a][b] for b in ids] for a in ids]
    assert sorted(assigned)==list(range(n))
    assert sum(node['degree'] for node in nodes)==2*len(edges)
    assert f['summary']['close_pairs']==len(edges)
    assert f['summary']['frame_alarm']==bool(edges)
    assert f['summary']['component_count_including_isolates']==len(groups)
    nearest=min((D[a][b] for a,b in itertools.combinations(range(n),2)),default=None)
    assert f['summary']['nearest_pair_distance_px']==nearest
    assert f['summary']['max_threshold_depth_px']==(max(0,rho-nearest) if nearest is not None else 0)
    assert {(e['a'],e['b']) for e in f['cross_cell_edges']}=={(a,b) for a,b in edges if nodes[a]['cell']!=nodes[b]['cell']}
    assert f['search_validation']['same_edge_set']


def run(folder):
    tests=[('empty',[],3),('singleton',[[1,1]],3),
           ('exact_threshold',[[0,0],[3,4]],5),
           ('boundary_pair',[[9.9,5],[10.1,5]],1),
           ('chain_not_clique',[[1,1],[5,1],[9,1]],5),
           ('coincident_estimates',[[5,5],[5,5]],1),
           ('wide_search',[[1,1],[25,1],[80,80]],30),
           ('outer_boundary',[[100,100],[99,99]],2)]
    for name,pts,rho in tests:
        f=analyze(pts,10,10,100,100,rho,1);check(f,rho)
        if name=='exact_threshold':assert not f['edges']
        if name=='boundary_pair':assert len(f['cross_cell_edges'])==1
        if name=='chain_not_clique':assert len(f['components'])==1 and not f['components'][0]['is_clique']
    # Rectangular production geometry and several grid/threshold choices.
    pts=[[0,0],[192,108],[191.5,107.5],[400,200],[1920,1080]]
    for rows,cols,rho in [(10,10,60),(3,7,250),(20,30,1),(1,1,5000)]:
        check(analyze(pts,rows,cols,1920,1080,rho,1),rho)
    root=Path(folder); manifest=json.loads((root/'manifest.json').read_text()); count=0
    for path in sorted((root/'frames').glob('*.json')):
        check(json.loads(path.read_text()),manifest['threshold_px']);count+=1
    assert count==manifest['summary']['frames']
    result={'status':'passed','export_frames_checked':count,'synthetic_cases':len(tests)+4,
            'checks':['Independent distance recomputation','Strict threshold incl equality fixture','Exact localized vs all-pairs edge sets during generation','Grid boundary and rectangular geometry cases','Matrix symmetry, diagonal, and dimensions','Cell partition conservation','Degrees and Laplacian','Independent connected components via union-find','Cross-cell preservation','Empty, singleton, duplicate-position, and non-clique chain behavior'],
            'scope':'Numerical/structural validation only. Does not establish detection accuracy or physical safety.'}
    (root/'validation_report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))


if __name__=='__main__':run(sys.argv[1])
