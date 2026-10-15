import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Run against `npm run dev`; the capture engine stays local to this page.
await mkdir("showcase", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5173");
await page.waitForTimeout(600);
await page.screenshot({ path: "showcase/title.png" });
const recording = await page.evaluate(`(async () => {
 const {createEngine,ConstantClock}=await import('/node_modules/@clockwyrks/simple-2d/dist/index.js');
 const {game,BACKGROUND}=await import('/src/game.ts');
 const {LAYOUT,STAGE_W,STAGE_H}=await import('/src/constants.ts');
 const canvas=document.createElement('canvas');
 canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:100';
 document.body.append(canvas);
 const engine=createEngine({canvas,width:STAGE_W,height:STAGE_H,game,background:BACKGROUND,layout:LAYOUT,clock:new ConstantClock(1000/60)});
 await engine.initialize();
 const d=engine.debug;
 const rows=Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>'RACJBSM'[(r*2+c)%7]+'0').join(' '));
 engine.apply(s=>d.setScreen(d.loadBoard(s,rows),'playing'));
 const stones=[[2,3,'R0'],[3,3,'R0'],[4,3,'J0'],[4,4,'R0'],[3,2,'B3'],[4,2,'J3'],[5,2,'S3'],[5,3,'C3'],[3,4,'A3'],[2,4,'M3'],[1,4,'J2'],[1,3,'C2'],[5,4,'B0s'],[6,5,'J0b'],[1,6,'X1'],[2,6,'J2'],[4,5,'J3']];
 for(const [c,r,t] of stones)engine.apply(s=>d.setGem(s,c,r,t));
 // Refill into a second run, so the capture shows a genuine cascading move.
 for(let c=0;c<8;c++)engine.apply(s=>d.setRefillKinds(s,c,'RRRACJBS'));
 await engine.advance(1);
 engine.startRecording();
 engine.apply(s=>d.pointerDown(s,676,432));
 engine.apply(s=>d.pointerMove(s,676,360));
 await engine.advance(18);
 engine.apply(s=>d.pointerUp(s));
 await engine.advance(230);
 const recording=engine.stopRecording();
 await engine.advance(1);
 return recording;
})()`);
await writeFile("showcase/chain.json.gz", gzipSync(JSON.stringify(recording)));
await page.screenshot({ path: "showcase/board.png" });
await browser.close();
