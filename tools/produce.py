"""One-time asset authoring. Not used by the build."""
import json,math,subprocess,pathlib,colorsys
ROOT=pathlib.Path('public/assets'); TMP=pathlib.Path('/tmp/facet-author');TMP.mkdir(exist_ok=True)
def run(*a):
 p=subprocess.run(list(map(str,a)),capture_output=True,text=True)
 if p.returncode: raise RuntimeError(p.stderr+p.stdout)
def save(p,d): pathlib.Path(p).write_text(json.dumps(d))
def render(ops,out,w=64,h=64):
 out=ROOT/out;out.parent.mkdir(parents=True,exist_ok=True);save(TMP/'ops.json',ops)
 run('draw','render','--actions',TMP/'ops.json','--out',out,'--width',w,'--height',h,'--no-layers')
def poly(pts,color,ops):
 for y in range(max(0,int(min(p[1] for p in pts))),int(max(p[1] for p in pts))+1):
  xs=[]
  for (x1,y1),(x2,y2) in zip(pts,pts[1:]+pts[:1]):
   if min(y1,y2)<=y<max(y1,y2):xs.append(x1+(y-y1)*(x2-x1)/(y2-y1))
  if len(xs)>1:ops.append(dict(op='line',x0=round(min(xs)),y0=y,x1=round(max(xs)),y1=y,color=color))
def line(a,b,c,ops):ops.append(dict(op='line',x0=round(a[0]),y0=round(a[1]),x1=round(b[0]),y1=round(b[1]),color=c))
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism'];hues=[.97,.075,.14,.39,.50,.62,.76,.55]
def gem(k,strain=0,turn=0,breakage=0):
 ops=[];n=[6,8,3,4,6,8,5,6][k]; angle=[0,math.pi/8,-math.pi/2,0,-math.pi/2,0,-math.pi/2,0][k]+turn
 pts=[(32+27*math.cos(angle+i*2*math.pi/n),32+27*math.sin(angle+i*2*math.pi/n)) for i in range(n)]
 inner=[(32+(x-32)*.49,32+(y-32)*.49) for x,y in pts]
 def color(h,l,s=.75):return '#'+''.join(f'{round(v*255):02x}' for v in colorsys.hls_to_rgb(h%1,l,s))
 for i in range(n):
  j=(i+1)%n;dx=breakage*math.cos(angle+(i+.5)*2*math.pi/n);dy=breakage*math.sin(angle+(i+.5)*2*math.pi/n)
  shift=lambda p:(p[0]+dx,p[1]+dy)
  h=hues[k] if k<7 else i/n
  poly([shift(pts[i]),shift(pts[j]),shift(inner[j]),shift(inner[i])],color(h,[.67,.44,.28,.35,.47,.58,.31,.46][i]),ops)
  poly([shift((32,32)),shift(inner[i]),shift(inner[j])],color(h,.59 if i%2 else .72),ops)
  line(shift(pts[i]),shift(pts[j]),color(h,.79),ops)
  line(shift(pts[i]),shift(inner[i]),color(h,.83),ops)
 line((21,20),(29,17),'#ffffff',ops);line((23,21),(23,25),'#ffffff',ops)
 cracks=[[(31,8),(28,25),(36,34),(29,43),(33,56)],[(12,28),(28,25),(42,22),(52,17)],[(8,43),(29,43),(42,36),(52,46)]]
 for path in cracks[:strain]:
  for a,b in zip(path,path[1:]):
   line((a[0]+1,a[1]),(b[0]+1,b[1]),'#fff4d8' if strain==3 else '#cce5ea',ops);line(a,b,'#140d28',ops)
 return ops
for k,name in enumerate(names):
 for s in range(4):render(gem(k,s),pathlib.Path('gems')/f'{name}-{s}.png')
 if k<7:
  for f in range(6):render(gem(k,3,breakage=f*4),pathlib.Path('gems/break')/name/f'{f}.png')

for name,n in [('brilliant',8),('star',4)]:
 ops=[]
 for i in range(n):
  a=i*math.pi*2/n;poly([(32+29*math.cos(a),32+29*math.sin(a)),(32+7*math.cos(a+.24),32+7*math.sin(a+.24)),(32+7*math.cos(a-.24),32+7*math.sin(a-.24))],'#fff4c9d0',ops)
 render(ops,'gems/'+name+'.png')
ops=[]
for inset,col in [(0,'#0b1922'),(2,'#53757a'),(3,'#192f39'),(8,'#30494e'),(10,'#a79b72'),(11,'#0c1b25')]:
 ops.append(dict(op='stroke_rect',x=inset,y=inset,width=600-inset*2,height=600-inset*2,color=col))
for x in range(12,588,72):
 for y in range(12,588,72):
  ops.append(dict(op='stroke_rect',x=x,y=y,width=72,height=72,color='#20343c'))
for x,y in [(3,3),(585,3),(3,585),(585,585)]:poly([(x,y+5),(x+5,y),(x+10,y+5),(x+5,y+10)],'#e2c58b',ops)
render(ops,'gems/frame.png',600,600)
# Tool configurations are retained as provenance, alongside their operation logs.
for name,count,speed,life in [('clear',14,65,380),('flawed',35,125,600),('cut',24,90,650),('aura',0,15,900)]:
 d=ROOT/'fx'/name;d.mkdir(parents=True,exist_ok=True)
 cfg=dict(width=128,height=128,duration_ms=1200,fps=30,seed=42,actions=str(d/'actions.json'),preview=str(TMP/(name+'.gif')),system=str(d/'system.json'))
 save(TMP/'particle.json',cfg)
 run('particle-2d','--config',TMP/'particle.json','init')
 args=['particle-2d','--config',TMP/'particle.json','add-emitter','--name','sparks','--shape','disc','--x',0,'--y',0,'--radius',20 if name=='aura' else 3,'--lifetime',life,'--speed',speed,'--cone-angle',180]
 args+=['--rate',9] if name=='aura' else ['--burst',count]
 run(*args)
 run('particle-2d','--config',TMP/'particle.json','set-particle','--emitter','sparks','--size-from',2.5,'--size-to',0,'--opacity-from',.9,'--opacity-to',0,'--color-gradient','#fff4cc@0,#70e7e0@0.5,#537bad@1')
 if name=='aura':run('particle-2d','--config',TMP/'particle.json','set-timeline','--loop','true')
 run('particle-2d','--config',TMP/'particle.json','render','--frame',10,'--out',TMP/(name+'.png'))
print('art done')
# Re-emit animation frames with the sheet rasterizer.
for k,name in enumerate(names[:7]):
 for f in range(6):
  save(TMP/'ops.json',gem(k,3,breakage=f*4));run('draw-sheet','render','--actions',TMP/'ops.json','--out',ROOT/'gems/break'/name/f'{f}.png','--width',64,'--height',64,'--no-layers')
for strain in range(4):
 for f in range(12):
  save(TMP/'ops.json',gem(7,strain,turn=f*math.pi/36));run('draw-sheet','render','--actions',TMP/'ops.json','--out',ROOT/'gems/prism-turn'/f'{strain}-{f}.png','--width',64,'--height',64,'--no-layers')
def config(name,tool,duration=1200):
 d=ROOT/'audio';cfg=dict(sample_rate=22050,channels='mono',max_duration_ms=duration,seed=42,actions=str(d/(name+'.actions.json')),preview=str(TMP/(name+'.png')),wav=str(d/(name+'.wav')),mid=str(d/(name+'.mid')))
 save(TMP/'audio.json',cfg);run(tool,'--config',TMP/'audio.json','init')
def call(tool,*args):run(tool,'--config',TMP/'audio.json',*args)
for name,freq,dur,wave in [('select',900,80,'triangle'),('swap',580,140,'sine'),('refuse',130,160,'triangle'),('land',90,160,'sine'),('flaw',200,95,'noise'),('cut',1600,450,'sine'),('levelup',660,700,'sine'),('gameover',330,850,'triangle')]+[(f'chain{i+1}',440*2**(i/12*2),340,'sine') for i in range(8)]:
 config(name,'sfx-synth');call('sfx-synth','add-voice','--name','body','--wave',wave,'--freq',freq,'--gain',-15,'--dur',dur);call('sfx-synth','set-envelope','--voice','body','--env','pluck')
 if name in ['levelup','gameover','swap']:
  call('sfx-synth','set-pitch','--voice','body','--slide-to',freq*(2 if name!='gameover' else .35),'--over',dur)
 if name.startswith('chain') or name=='cut':
  call('sfx-synth','add-voice','--name','overtone','--wave','sine','--freq',freq*2.76,'--gain',-24,'--dur',dur*.6)
 call('sfx-synth','render')
config('shatter','sfx-sample');call('sfx-sample','add-sample','--name','debris_glass','--t',0,'--gain',-16);call('sfx-sample','render')
for name,bpm in [('title',108),('play',80)]:
 config(name,'music',26000);call('music','set-tempo','--bpm',bpm)
 for track,inst in [('hook','music_box'),('harmony','vibraphone'),('pulse','marimba')]:call('music','define-track','--name',track,'--instrument',inst)
 melody=[76,79,83,81,79,74,76,71,72,76,79,78,74,71,74,76]
 for i in range(32):
  call('music','add-note','--track','hook','--pitch',melody[i%16],'--t',i,'--dur',.7,'--velocity',65 if name=='title' else 40)
  if i%2==0:
   call('music','add-note','--track','pulse','--pitch',[52,48,55,50][i//8],'--t',i,'--dur',1.5,'--velocity',45)
  if i%4==0:
   for pitch in [[64,67,71],[60,64,67],[62,67,71],[62,66,69]][i//8]:call('music','add-note','--track','harmony','--pitch',pitch,'--t',i,'--dur',3.5,'--velocity',35)
 call('music','render')
print('sound done')
