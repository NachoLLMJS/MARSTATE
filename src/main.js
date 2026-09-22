import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const canvas = document.querySelector('#world');
const wrap = document.querySelector('#worldWrap');
const appLoader = document.querySelector('#appLoader');
const creditsEl = document.querySelector('#credits');
const oxygenEl = document.querySelector('#oxygen');
const populationEl = document.querySelector('#population');
const levelEl = document.querySelector('#levelValue');
const buildPanel = document.querySelector('#buildPanel');
const buildButton = document.querySelector('#buildButton');
const buildPrice = document.querySelector('#buildPrice');
const plotId = document.querySelector('#plotId');
const toast = document.querySelector('#toast');
const unlockOverlay = document.querySelector('#unlockOverlay');
const unlockName = document.querySelector('#unlockName');
const missionTitle = document.querySelector('#missionTitle');
const missionText = document.querySelector('#missionText');
const progressText = document.querySelector('#progressText');
const progressBar = document.querySelector('#progressBar');
const txFeed = document.querySelector('#txFeed');
const feedBlock = document.querySelector('#feedBlock');
const feedPlayers = document.querySelector('#feedPlayers');
const feedVolume = document.querySelector('#feedVolume');
const propertyModal = document.querySelector('#propertyModal');
const propertyType = document.querySelector('#propertyType');
const propertyWallet = document.querySelector('#propertyWallet');
const propertyParcel = document.querySelector('#propertyParcel');
const propertyBlock = document.querySelector('#propertyBlock');
const propertyStatus = document.querySelector('#propertyStatus');

const BUILDINGS = {
  habitat: { name: '阿瑞斯栖息舱', cost: 400, people: 12, oxygen: 8 },
  dome: { name: '生命穹顶', cost: 650, people: 20, oxygen: 5 },
  tower: { name: '赫利俄斯高塔', cost: 900, people: 32, oxygen: -4 },
  greenhouse: { name: '伊甸温室', cost: 750, people: 8, oxygen: 18 },
  reactor: { name: '聚变反应堆', cost: 1100, people: 6, oxygen: 4 },
  observatory: { name: '开普勒观测站', cost: 850, people: 10, oxygen: -2 },
  solar: { name: '索利斯太阳能场', cost: 700, people: 2, oxygen: 0 },
};
const BLOCK_SPACING = 7;
const cellKey=(gx,gz)=>`${gx}:${gz}`;
const isRevealed=(gx,gz)=>state.revealed.includes(cellKey(gx,gz));
const blockRadius = () => state.generatedRadius;
const visibleBlockRadius = () => Math.max(1,...state.revealed.map(key=>Math.max(...key.split(':').map(Number).map(Math.abs))));
const mapRadius = () => (visibleBlockRadius()+1.35)*BLOCK_SPACING;
let PLOTS = [];
function generatePlotCatalog() {
  const plots=[],radius=blockRadius();
  for(let gx=-radius;gx<=radius;gx++)for(let gz=-radius;gz<=radius;gz++){
    const revealed=isRevealed(gx,gz);
    const edge=revealed&&[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dz])=>!isRevealed(gx+dx,gz+dz));
    plots.push({id:`LOT-${gx}-${gz}`,x:gx*BLOCK_SPACING,z:gz*BLOCK_SPACING,rotation:((gx+gz)&1)?0:Math.PI/2,edge,gx,gz});
  }
  PLOTS=plots;
}
const initialRevealed=[];
for(let gx=-1;gx<=1;gx++)for(let gz=-1;gz<=1;gz++)initialRevealed.push(cellKey(gx,gz));
const defaultState = { version:5, credits:4000, expansions:0, generatedRadius:6, revealed:initialRevealed, houses:[] };
let state;
try { state = { ...defaultState, ...JSON.parse(localStorage.getItem('mars-city-state') || '{}') }; }
catch { state = structuredClone(defaultState); }
if(state.version!==5)state=structuredClone(defaultState);
if (!Array.isArray(state.houses)) state.houses = [];
if(!Array.isArray(state.revealed))state.revealed=[...initialRevealed];
state.expansions=Math.max(0,Number(state.expansions)||0);
state.generatedRadius=Math.max(6,Number(state.generatedRadius)||6);
const ownerWallets=['0x7A91…3F2C','0xC482…91AE','0x19D0…B77F','0xE5B3…42D1','0xA810…CC09','0x63FE…108B','0xB249…7DA4'];
function walletForPlot(plotId){let hash=0;for(const char of plotId)hash=(hash*31+char.charCodeAt(0))>>>0;return ownerWallets[hash%ownerWallets.length]}
state.houses.forEach(h=>{if(!h.wallet)h.wallet=walletForPlot(h.plot)});
generatePlotCatalog();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3b160e);
scene.fog = new THREE.FogExp2(0x4d1c12, 0.014);
const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 260);
camera.position.set(19, 22, 24);
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.enablePan = false;
controls.minDistance = 16;
controls.maxDistance = 110;
controls.minPolarAngle = .55;
controls.maxPolarAngle = 1.18;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xffbd87, 0x180908, 2.3));
const sun = new THREE.DirectionalLight(0xffb073, 4.2);
sun.position.set(-16, 28, 13); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-25; sun.shadow.camera.right=25; sun.shadow.camera.top=25; sun.shadow.camera.bottom=-25;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x5d8fa9, 1.1); rim.position.set(18,9,-20); scene.add(rim);

const world = new THREE.Group(); scene.add(world);
const terrainGroup = new THREE.Group();
const roadsGroup = new THREE.Group();
const plotsGroup = new THREE.Group();
const buildingsGroup = new THREE.Group();
const fogGroup = new THREE.Group();
world.add(terrainGroup, roadsGroup, plotsGroup, buildingsGroup, fogGroup);

const roadMat = new THREE.MeshStandardMaterial({ color:0x171b1e, roughness:.7, metalness:.32 });
const curbMat = new THREE.MeshStandardMaterial({ color:0x8f8178, roughness:.6, metalness:.28 });
const roadMarkMat = new THREE.MeshBasicMaterial({ color:0xffb13b, toneMapped:false });
const roadLightMat = new THREE.MeshBasicMaterial({ color:0x58dcea, toneMapped:false });
const plotMat = new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false });
const plotHoverMat = new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false });

function seeded(seed) { const x = Math.sin(seed * 999.91) * 43758.5453; return x - Math.floor(x); }
function clearGroup(group) {
  while(group.children.length) {
    const child=group.children.pop();
    child.traverse?.(obj=>{ if(obj.geometry) obj.geometry.dispose(); if(obj.material){ const mats=Array.isArray(obj.material)?obj.material:[obj.material]; mats.forEach(m=>m.dispose()); } });
  }
}
function makeGroundTexture() {
  const size=768, c=document.createElement('canvas'); c.width=c.height=size;
  const ctx=c.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,size,size);
  gradient.addColorStop(0,'#8d3c26'); gradient.addColorStop(.48,'#642719'); gradient.addColorStop(1,'#431811');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);
  for(let i=0;i<5200;i++){
    const x=seeded(i*3)*size,y=seeded(i*7+2)*size,r=.4+seeded(i+4)*2.4;
    ctx.fillStyle=`rgba(${seeded(i)>.5?'255,157,94':'39,10,7'},${.025+seeded(i+1)*.07})`;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<18;i++){
    ctx.strokeStyle=`rgba(255,150,91,${.025+seeded(i)*.035})`;ctx.lineWidth=2+seeded(i+5)*7;
    ctx.beginPath();ctx.moveTo(-30,seeded(i+2)*size);ctx.bezierCurveTo(size*.25,seeded(i+3)*size,size*.65,seeded(i+8)*size,size+30,seeded(i+9)*size);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
}
function addRock(x,z,seed,scale=1) {
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry((.15+seeded(seed+5)*.34)*scale,0),new THREE.MeshStandardMaterial({color:seeded(seed)>.5?0x4d1b13:0x68291b,roughness:1}));
  rock.position.set(x,.04,z); rock.scale.y=.55+seeded(seed+2)*.8; rock.rotation.set(seeded(seed)*2,seeded(seed+1)*3,0); rock.castShadow=true;terrainGroup.add(rock);
}
function addRoadBetween(x1,z1,x2,z2,width=2.05) {
  const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz),angle=Math.atan2(dz,dx);
  const midX=(x1+x2)/2,midZ=(z1+z2)/2,perpX=-Math.sin(angle),perpZ=Math.cos(angle);
  const road=new THREE.Mesh(new THREE.BoxGeometry(length,.12,width),roadMat.clone());
  road.position.set(midX,.02,midZ);road.rotation.y=-angle;road.receiveShadow=true;roadsGroup.add(road);
  [-1,1].forEach(side=>{
    const curb=new THREE.Mesh(new THREE.BoxGeometry(length,.08,.12),curbMat.clone());
    curb.position.set(midX+perpX*side*(width/2+.08),.09,midZ+perpZ*side*(width/2+.08));curb.rotation.y=-angle;roadsGroup.add(curb);
  });
  for(let d=1.5;d<length-1;d+=2.2){
    const t=d/length,dash=new THREE.Mesh(new THREE.BoxGeometry(.9,.025,.09),roadMarkMat.clone());
    dash.position.set(x1+dx*t,.095,z1+dz*t);dash.rotation.y=-angle;roadsGroup.add(dash);
  }
}
function addIntersection(x,z,width=2.05){
  const patch=new THREE.Mesh(new THREE.BoxGeometry(width+.18,.035,width+.18),roadMat.clone());patch.position.set(x,.095,z);roadsGroup.add(patch);
  for(let i=-1;i<=1;i++)if(i!==0){const stripe=new THREE.Mesh(new THREE.BoxGeometry(.12,.018,.42),curbMat.clone());stripe.position.set(x+i*.42,.12,z+width*.34);roadsGroup.add(stripe)}
}
function buildRoadNetwork() {
  const radius=blockRadius(),extent=(radius+.5)*BLOCK_SPACING,lines=[];
  for(let i=-radius;i<=radius+1;i++)lines.push((i-.5)*BLOCK_SPACING);
  lines.forEach(x=>addRoadBetween(x,-extent,x,extent,1.78));
  lines.forEach(z=>addRoadBetween(-extent,z,extent,z,1.78));
  lines.forEach(x=>lines.forEach(z=>addIntersection(x,z,1.78)));
}
function addTree(x,z,scale=1){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,.45,7),new THREE.MeshStandardMaterial({color:0x4b281b,roughness:1}));trunk.position.set(x,.28,z);terrainGroup.add(trunk);
  const crown=new THREE.Mesh(new THREE.DodecahedronGeometry(.34*scale,1),new THREE.MeshStandardMaterial({color:0x6d8255,roughness:.95}));crown.position.set(x,.68,z);crown.scale.y=1.25;terrainGroup.add(crown);
}
function addSmallCrater(x,z,scale=1){
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.58*scale,.13*scale,7,20),new THREE.MeshStandardMaterial({color:0x703421,roughness:1}));rim.rotation.x=Math.PI/2;rim.position.set(x,-.035,z);rim.scale.y=.68;terrainGroup.add(rim);
  const hollow=new THREE.Mesh(new THREE.CircleGeometry(.49*scale,20),new THREE.MeshStandardMaterial({color:0x32120d,roughness:1}));hollow.rotation.x=-Math.PI/2;hollow.position.set(x,-.045,z);hollow.scale.y=.68;terrainGroup.add(hollow);
}
function addMineralCluster(x,z,seed){
  const group=new THREE.Group();group.position.set(x,0,z);
  for(let i=0;i<3;i++){const crystal=new THREE.Mesh(new THREE.ConeGeometry(.09+seeded(seed+i)*.08,.35+seeded(seed+i+8)*.45,5),new THREE.MeshStandardMaterial({color:i%2?0x8fd5cf:0x5b8d91,emissive:0x173f42,emissiveIntensity:.55,metalness:.4,roughness:.35}));crystal.position.set((seeded(seed+i*4)-.5)*.45,crystal.geometry.parameters.height/2,(seeded(seed+i*9)-.5)*.45);crystal.rotation.z=(seeded(seed+i*3)-.5)*.28;group.add(crystal)}
  terrainGroup.add(group);
}
function buildTerrain(newlyRevealed=[]) {
  clearGroup(terrainGroup);clearGroup(roadsGroup);
  const radius=blockRadius(),extent=(radius+.72)*BLOCK_SPACING,groundSize=extent*2+5;
  const ground=new THREE.Mesh(new THREE.BoxGeometry(groundSize,.34,groundSize),new THREE.MeshStandardMaterial({map:makeGroundTexture(),color:0xbd5a3c,roughness:.98,metalness:0}));ground.position.y=-.25;ground.receiveShadow=true;terrainGroup.add(ground);
  const activePlots=PLOTS;
  for(let i=0;i<72+state.expansions*14;i++){
    const x=(seeded(i*11)-.5)*groundSize*.9,z=(seeded(i*17+3)-.5)*groundSize*.9;
    const nearBlock=activePlots.some(p=>Math.hypot(p.x-x,p.z-z)<3.1)||Math.hypot(x,z)<3.5;
    if(!nearBlock)addRock(x,z,i,seeded(i+8)>.94?1.5:.65);
  }
  for(let i=0;i<18+state.expansions*2;i++){
    const x=(seeded(i*29+5)-.5)*groundSize*.88,z=(seeded(i*41+7)-.5)*groundSize*.88;
    const clear=activePlots.every(p=>Math.hypot(p.x-x,p.z-z)>3.35)&&Math.hypot(x,z)>3.8;
    if(clear)addSmallCrater(x,z,.55+seeded(i*13)*.85);
  }
  for(let i=0;i<12+state.expansions;i++){
    const x=(seeded(i*47+9)-.5)*groundSize*.86,z=(seeded(i*53+2)-.5)*groundSize*.86;
    if(activePlots.every(p=>Math.hypot(p.x-x,p.z-z)>3.2)&&Math.hypot(x,z)>3.6)addMineralCluster(x,z,i*23);
  }
  createFogBoundary(newlyRevealed);
}
function paintFogMask(fog,time=performance.now()){
  const {canvas,ctx,baseCanvas,worldSize,newKeys,start}=fog.userData,px=canvas.width;
  ctx.clearRect(0,0,px,px);ctx.globalCompositeOperation='source-over';ctx.drawImage(baseCanvas,0,0);
  ctx.globalCompositeOperation='destination-out';
  state.revealed.forEach(key=>{
    const [gx,gz]=key.split(':').map(Number),animated=newKeys.has(key),t=animated?Math.min(1,(time-start)/1550):1;
    if(t<=0)return;
    const x=(gx*BLOCK_SPACING/worldSize+.5)*px,y=(gz*BLOCK_SPACING/worldSize+.5)*px,r=BLOCK_SPACING*1.18/worldSize*px*t;
    const hole=ctx.createRadialGradient(x,y,Math.max(1,r*.54),x,y,Math.max(2,r));hole.addColorStop(0,'rgba(0,0,0,1)');hole.addColorStop(.7,'rgba(0,0,0,.94)');hole.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=hole;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  });
  ctx.globalCompositeOperation='source-over';fog.material.map.needsUpdate=true;
  if((time-start)>=1550)fog.userData.animating=false;
}
function createFogBoundary(newlyRevealed=[]) {
  clearGroup(fogGroup);
  const size=512,canvas=document.createElement('canvas'),baseCanvas=document.createElement('canvas');canvas.width=canvas.height=baseCanvas.width=baseCanvas.height=size;
  const base=baseCanvas.getContext('2d');base.fillStyle='rgba(48,17,13,.96)';base.fillRect(0,0,size,size);
  for(let i=0;i<95;i++){const x=seeded(i*19)*size,y=seeded(i*37+4)*size,r=35+seeded(i*11+7)*105,g=base.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(174,88,57,${.08+seeded(i+9)*.12})`);g.addColorStop(1,'rgba(80,31,22,0)');base.fillStyle=g;base.fillRect(x-r,y-r,r*2,r*2)}
  const radius=blockRadius(),worldSize=(radius*2+1.8)*BLOCK_SPACING,texture=new THREE.CanvasTexture(canvas);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.97,depthWrite:false,side:THREE.DoubleSide});
  const fog=new THREE.Mesh(new THREE.PlaneGeometry(worldSize,worldSize),material);fog.rotation.x=-Math.PI/2;fog.position.y=4.2;fog.renderOrder=8;
  fog.userData={canvas,ctx:canvas.getContext('2d'),baseCanvas,worldSize,newKeys:new Set(newlyRevealed),start:performance.now(),animating:newlyRevealed.length>0};fogGroup.add(fog);paintFogMask(fog);
}

function createPlot(plot) {
  const group=new THREE.Group(); group.position.set(plot.x,.08,plot.z);group.rotation.y=-plot.rotation;group.userData.plot=plot;
  const baseGeo=new THREE.BoxGeometry(4.42,.09,4.42);
  const base=new THREE.Mesh(baseGeo,plotMat.clone());base.receiveShadow=true;base.userData.plot=plot;group.add(base);
  const half=2.28,borderGeo=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-half,.12,-half),new THREE.Vector3(half,.12,-half),new THREE.Vector3(half,.12,half),new THREE.Vector3(-half,.12,half),new THREE.Vector3(-half,.12,-half)
  ]);
  const frame=new THREE.Line(borderGeo,new THREE.LineBasicMaterial({color:0xffd21f,transparent:true,opacity:plot.edge?1:.78}));frame.raycast=()=>{};group.add(frame);
  plotsGroup.add(group); return group;
}
function rebuildPlots() {
  clearGroup(plotsGroup);
  PLOTS.filter(p=>isRevealed(p.gx,p.gz)&&!state.houses.some(h=>h.plot===p.id)).forEach(createPlot);
}
const metal = new THREE.MeshStandardMaterial({color:0xb7b8aa,metalness:.67,roughness:.34});
const darkMetal = new THREE.MeshStandardMaterial({color:0x30383a,metalness:.75,roughness:.31});
const orange = new THREE.MeshStandardMaterial({color:0xe85a2a,emissive:0x431006,emissiveIntensity:.45,metalness:.35,roughness:.48});
const glass = new THREE.MeshPhysicalMaterial({color:0x78d9d8,emissive:0x133e47,emissiveIntensity:1.15,metalness:.1,roughness:.18,transparent:true,opacity:.76});
const solarCell = new THREE.MeshStandardMaterial({color:0x345d9a,emissive:0x102b52,emissiveIntensity:.65,metalness:.58,roughness:.24});
function mesh(geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat.clone());m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m}
function habitatModel(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.05,1.05,1.15,16,1,false,0,Math.PI),metal,0,.63,0));
  const body=mesh(new THREE.BoxGeometry(2.1,1.12,1.55),metal,0,.62,0);g.add(body);
  g.add(mesh(new THREE.BoxGeometry(2.18,.22,1.62),orange,0,.3,0));
  g.add(mesh(new THREE.BoxGeometry(.58,.56,.08),glass,0,.72,.81));
  [-.72,.72].forEach(x=>g.add(mesh(new THREE.BoxGeometry(.42,.08,.1),glass,x,.74,.82)));
  const module=mesh(new THREE.CylinderGeometry(.37,.46,.8,12),orange,.72,1.45,0);g.add(module);
  const antenna=mesh(new THREE.CylinderGeometry(.025,.025,.8,6),darkMetal,.72,2.02,0);g.add(antenna);
  g.add(mesh(new THREE.SphereGeometry(.08,8,6),glass,.72,2.45,0)); return g;
}
function domeModel(){
  const g=new THREE.Group();
  const dome=mesh(new THREE.SphereGeometry(1.23,24,12,0,Math.PI*2,0,Math.PI/2),glass,0,.08,0);g.add(dome);
  g.add(mesh(new THREE.CylinderGeometry(1.28,1.35,.28,24),darkMetal,0,.14,0));
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2; const rib=mesh(new THREE.BoxGeometry(.045,1.42,.05),metal,Math.sin(a)*.69,.72,Math.cos(a)*.69);rib.rotation.z=Math.sin(a)*.78;rib.rotation.x=Math.cos(a)*.78;g.add(rib)}
  const core=mesh(new THREE.CylinderGeometry(.3,.5,.65,10),orange,0,.45,0);g.add(core);return g;
}
function towerModel(){
  const g=new THREE.Group();
  const base=mesh(new THREE.CylinderGeometry(.9,1.12,.35,8),darkMetal,0,.18,0);g.add(base);
  const shaft=mesh(new THREE.CylinderGeometry(.46,.72,2.55,8),metal,0,1.54,0);g.add(shaft);
  for(let y=.65;y<2.7;y+=.55)g.add(mesh(new THREE.CylinderGeometry(.64,.64,.13,8),orange,0,y,0));
  g.add(mesh(new THREE.CylinderGeometry(.025,.025,1.05,6),darkMetal,0,3.25,0));
  const dish=mesh(new THREE.CylinderGeometry(.65,.18,.18,16),metal,0,3.55,0);dish.rotation.x=.55;g.add(dish);return g;
}
function greenhouseModel(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.25,.34,1.62),darkMetal,0,.18,0));
  const chamber=mesh(new THREE.BoxGeometry(2.05,.86,1.4),glass,0,.76,0);g.add(chamber);
  for(let x=-.92;x<=.92;x+=.46)g.add(mesh(new THREE.BoxGeometry(.045,1.02,1.48),metal,x,.79,0));
  const roofL=mesh(new THREE.BoxGeometry(2.14,.06,1.04),glass,0,1.35,-.35);roofL.rotation.x=-.62;g.add(roofL);
  const roofR=mesh(new THREE.BoxGeometry(2.14,.06,1.04),glass,0,1.35,.35);roofR.rotation.x=.62;g.add(roofR);
  g.add(mesh(new THREE.CylinderGeometry(.12,.12,.8,8),orange,.85,1.78,0));return g;
}
function reactorModel(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.05,1.18,.32,12),darkMetal,0,.17,0));
  const core=mesh(new THREE.CylinderGeometry(.62,.76,2.05,12),metal,0,1.18,0);g.add(core);
  for(let y=.48;y<2.15;y+=.43)g.add(mesh(new THREE.CylinderGeometry(.78,.78,.12,12),orange,0,y,0));
  [-1,1].forEach(side=>{g.add(mesh(new THREE.CylinderGeometry(.3,.38,1.25,10),darkMetal,side*.92,.73,0));const pipe=mesh(new THREE.TorusGeometry(.38,.075,6,12,Math.PI),orange,side*.55,1.3,0);pipe.rotation.z=side*Math.PI/2;g.add(pipe)});
  g.add(mesh(new THREE.SphereGeometry(.24,12,8),glass,0,2.35,0));return g;
}
function observatoryModel(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.02,1.12,.38,12),darkMetal,0,.2,0));
  g.add(mesh(new THREE.CylinderGeometry(.83,.94,1.18,12),metal,0,.93,0));
  const dome=mesh(new THREE.SphereGeometry(.87,20,10,0,Math.PI*2,0,Math.PI/2),glass,0,1.48,0);g.add(dome);
  const telescope=mesh(new THREE.CylinderGeometry(.19,.27,1.55,10),darkMetal,.2,2.05,0);telescope.rotation.z=-.72;g.add(telescope);
  const lens=mesh(new THREE.CylinderGeometry(.31,.31,.12,12),glass,.7,2.62,0);lens.rotation.z=-.72;g.add(lens);return g;
}
function solarModel(){
  const g=new THREE.Group(),rows=[3,4,4,3];
  rows.forEach((count,row)=>{for(let col=0;col<count;col++){
    const x=(col-(count-1)/2)*.7,z=(row-1.5)*.65;
    const post=mesh(new THREE.CylinderGeometry(.035,.055,.42,6),darkMetal,x,.23,z);g.add(post);
    const panel=mesh(new THREE.CylinderGeometry(.31,.31,.045,8),solarCell,x,.55,z);panel.rotation.x=-.22;g.add(panel);
    const rim=new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry),new THREE.LineBasicMaterial({color:0xaad9ef,transparent:true,opacity:.85}));rim.position.copy(panel.position);rim.rotation.copy(panel.rotation);g.add(rim);
    [-.12,.12].forEach(offset=>{const grid=mesh(new THREE.BoxGeometry(.012,.018,.54),metal,x+offset,.585,z);grid.rotation.x=-.22;g.add(grid)});
  }});return g;
}
const MODEL_FACTORIES={habitat:habitatModel,dome:domeModel,tower:towerModel,greenhouse:greenhouseModel,reactor:reactorModel,observatory:observatoryModel,solar:solarModel};
function addBuilding(record,animate=false){
  const plot=PLOTS.find(p=>p.id===record.plot); if(!plot)return;
  const wrapper=new THREE.Group(),model=(MODEL_FACTORIES[record.type]||habitatModel)();
  model.scale.setScalar(1.4);model.rotation.y=record.rotation ?? plot.rotation;wrapper.add(model);
  wrapper.position.set(plot.x,.04,plot.z);wrapper.userData.record=record;wrapper.userData.building=true;
  if(animate){wrapper.scale.set(.05,.05,.05);wrapper.userData.buildStart=performance.now();createBuildParticles(plot.x,plot.z)}
  buildingsGroup.add(wrapper);
}
function rebuildBuildings(){clearGroup(buildingsGroup);state.houses.forEach(h=>addBuilding(h))}
const particleGroup=new THREE.Group();world.add(particleGroup);
function createBuildParticles(x,z){for(let i=0;i<18;i++){const p=mesh(new THREE.BoxGeometry(.05,.05,.05),new THREE.MeshBasicMaterial({color:i%2?0xff7a35:0x83ecff}),x+(seeded(i)-.5)*2,.2+seeded(i+4)*2,z+(seeded(i+8)-.5)*2);p.userData={born:performance.now(),speed:.5+seeded(i+2)};particleGroup.add(p)}}

let selectedPlot=null, selectedType='habitat', hovered=null;
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
function pointerPosition(event){const rect=canvas.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;}
function intersectPlots(event){pointerPosition(event);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(plotsGroup.children,true).find(hit=>hit.object.userData.plot||hit.object.parent?.userData.plot)}
function intersectBuildings(event){pointerPosition(event);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(buildingsGroup.children,true)[0];if(!hit)return null;let owner=hit.object;while(owner&&owner.parent!==buildingsGroup)owner=owner.parent;return owner?.userData?.record?owner:null}
function openPropertyModal(record){const building=BUILDINGS[record.type]||BUILDINGS.habitat;propertyType.textContent=building.name;propertyWallet.textContent=record.wallet||walletForPlot(record.plot);propertyParcel.textContent=record.plot;propertyBlock.textContent=`#${simulatedBlock.toLocaleString('en-US')}`;propertyStatus.textContent='已确认';propertyModal.classList.add('open');propertyModal.setAttribute('aria-hidden','false')}
function closePropertyModal(){propertyModal.classList.remove('open');propertyModal.setAttribute('aria-hidden','true')}
canvas.addEventListener('pointermove',event=>{
  const building=intersectBuildings(event);if(building){canvas.style.cursor='pointer';return}
  const hit=intersectPlots(event);const target=hit?(hit.object.userData.plot?hit.object:hit.object.parent.children[0]):null;
  if(hovered&&hovered!==target) hovered.material=plotMat.clone();
  hovered=target;if(hovered)hovered.material=plotHoverMat.clone();canvas.style.cursor=hit?'pointer':'grab';
});
canvas.addEventListener('click',event=>{
  if(Math.abs(event.movementX)>3||Math.abs(event.movementY)>3)return;
  const building=intersectBuildings(event);if(building){openPropertyModal(building.userData.record);return}
  const hit=intersectPlots(event); if(!hit)return;
  selectedPlot=hit.object.userData.plot||hit.object.parent.userData.plot;
  plotId.textContent=selectedPlot.edge?`外部边界 · ${selectedPlot.id}`:`城市核心 · ${selectedPlot.id}`;
  buildPanel.classList.add('open');buildPanel.setAttribute('aria-hidden','false');updateBuildButton();
});
document.querySelector('#closePanel').addEventListener('click',closePanel);
function closePanel(){selectedPlot=null;buildPanel.classList.remove('open');buildPanel.setAttribute('aria-hidden','true')}
document.querySelector('#closePropertyModal').addEventListener('click',closePropertyModal);
propertyModal.addEventListener('click',event=>{if(event.target===propertyModal)closePropertyModal()});
document.querySelector('#copyPropertyWallet').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(propertyWallet.textContent);showToast('钱包已复制')}catch{showToast('请手动复制钱包地址')}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closePropertyModal();closePanel()}});
document.querySelectorAll('.building-card').forEach(card=>card.addEventListener('click',()=>{document.querySelectorAll('.building-card').forEach(c=>c.classList.remove('selected'));card.classList.add('selected');selectedType=card.dataset.building;updateBuildButton()}));
function updateBuildButton(){const type=BUILDINGS[selectedType];buildPrice.textContent=`◈ ${type.cost}`;buildButton.disabled=state.credits<type.cost;}
buildButton.addEventListener('click',()=>{
  if(!selectedPlot||state.houses.some(h=>h.plot===selectedPlot.id))return;
  const type=BUILDINGS[selectedType];if(state.credits<type.cost){showToast('SPCX 余额不足');return}
  state.credits-=type.cost;const builtPlot=selectedPlot;const record={plot:builtPlot.id,type:selectedType,rotation:builtPlot.rotation,wallet:walletForPlot(builtPlot.id)};state.houses.push(record);addBuilding(record,true);pushSimulatedActivity({wallet:record.wallet,type:selectedType,amount:type.cost,local:true});closePanel();saveState();updateHUD();showToast(`${type.name} 已部署`);checkExpansion(builtPlot);
});
function stats(){return state.houses.reduce((sum,h)=>{const b=BUILDINGS[h.type]||BUILDINGS.habitat;sum.people+=b.people;sum.oxygen+=b.oxygen;return sum},{people:0,oxygen:100})}
function updateHUD(){const s=stats(),radius=mapRadius();creditsEl.textContent=state.credits.toLocaleString('en-US');populationEl.textContent=s.people.toLocaleString('en-US');oxygenEl.textContent=`${Math.max(0,s.oxygen)}%`;levelEl.textContent=String(state.expansions+1).padStart(2,'0');missionTitle.textContent='扩展城市边界';missionText.textContent='在黄色标记的地块上建造，扩大城市范围。';progressText.textContent=`${state.houses.length} 个模块 · 半径 ${radius} 米`;progressBar.style.width=`${Math.min(100,35+state.expansions*8)}%`;updateBuildButton()}
function checkExpansion(plot){
  if(!plot.edge)return;
  const newly=[];
  [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dz])=>{const gx=plot.gx+dx,gz=plot.gz+dz,key=cellKey(gx,gz);if(!state.revealed.includes(key)){state.revealed.push(key);newly.push(key)}});
  if(!newly.length)return;
  state.expansions++;state.credits+=350;
  const furthest=Math.max(...state.revealed.map(key=>Math.max(...key.split(':').map(Number).map(Math.abs))));
  if(furthest>=state.generatedRadius-1)state.generatedRadius+=4;
  generatePlotCatalog();saveState();buildTerrain(newly);rebuildPlots();rebuildBuildings();frameColony();showToast(`${newly.length} 个新区域从迷雾中显现`);updateHUD();
}
function frameColony(){const r=mapRadius();controls.target.set(0,0,0);const dir=camera.position.clone().sub(controls.target).normalize();const portraitFit=camera.aspect<.75?1.64:1;camera.position.copy(controls.target).add(dir.multiplyScalar((22+r*1.12)*portraitFit));controls.update()}
function saveState(){localStorage.setItem('mars-city-state',JSON.stringify(state))}
let toastTimer;function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2100)}
const SIM_WALLETS=['0x7A91…3F2C','0xC482…91AE','0x19D0…B77F','0xE5B3…42D1','0xA810…CC09','0x63FE…108B','0xB249…7DA4'];
const SIM_TYPES=['habitat','dome','tower','greenhouse','reactor','observatory','solar'];
let simulatedBlock=42819240,simulatedVolume=18400,simulatedPlayers=128;
function pushSimulatedActivity({wallet,type,amount,local=false,initial=false}){
  if(!txFeed)return;
  if(!initial)simulatedBlock+=1+Math.floor(Math.random()*3);
  simulatedVolume+=amount;feedBlock.textContent=`#${simulatedBlock.toLocaleString('en-US')}`;feedPlayers.textContent=String(simulatedPlayers);feedVolume.textContent=`${(simulatedVolume/1000).toFixed(1)}K SPCX`;
  const item=document.createElement('article'),building=BUILDINGS[type]||BUILDINGS.habitat;
  item.className='tx-item';item.innerHTML=`<div class="tx-item__top"><b>${wallet}</b><span>−${amount} SPCX</span></div><p>购买了 ${building.name}</p><div class="tx-item__bottom"><span>区块 ${simulatedBlock.toLocaleString('en-US')}</span><em>${local?'本地记录':'已确认'}</em></div>`;
  txFeed.prepend(item);while(txFeed.children.length>7)txFeed.lastElementChild.remove();
}
[
  ['0x7A91…3F2C','solar',700],['0xC482…91AE','habitat',400],['0x19D0…B77F','greenhouse',750],['0xE5B3…42D1','dome',650],['0xA810…CC09','observatory',850],['0x63FE…108B','reactor',1100]
].reverse().forEach(([wallet,type,amount])=>pushSimulatedActivity({wallet,type,amount,initial:true}));
setInterval(()=>{const type=SIM_TYPES[Math.floor(Math.random()*SIM_TYPES.length)],wallet=SIM_WALLETS[Math.floor(Math.random()*SIM_WALLETS.length)];simulatedPlayers+=Math.random()>.75?1:0;pushSimulatedActivity({wallet,type,amount:BUILDINGS[type].cost})},3600);
document.querySelector('#resetButton').addEventListener('click',()=>{if(confirm('确定要重置殖民地并删除全部进度吗？')){state=structuredClone(defaultState);generatePlotCatalog();saveState();buildTerrain();rebuildPlots();rebuildBuildings();updateHUD();frameColony();showToast('殖民地已重置')}});
document.querySelector('#soundButton').addEventListener('click',event=>{event.currentTarget.classList.toggle('active');showToast(event.currentTarget.classList.contains('active')?'声音已开启':'声音已关闭')});

function resize(){const w=wrap.clientWidth,h=wrap.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
new ResizeObserver(resize).observe(wrap);resize();
const clock=new THREE.Clock();
function animate(time){requestAnimationFrame(animate);const dt=clock.getDelta();controls.update();
  const fog=fogGroup.children[0];if(fog?.userData.animating)paintFogMask(fog,time);
  buildingsGroup.children.forEach(g=>{if(g.userData.buildStart){const t=Math.min(1,(time-g.userData.buildStart)/720);const ease=1-Math.pow(1-t,3);g.scale.set(ease,ease,ease);if(t===1)delete g.userData.buildStart}});
  for(let i=particleGroup.children.length-1;i>=0;i--){const p=particleGroup.children[i],age=(time-p.userData.born)/1000;p.position.y+=dt*p.userData.speed;p.rotation.x+=dt*2;p.material.opacity=1-age/1.5;p.material.transparent=true;if(age>1.5){particleGroup.remove(p);p.geometry.dispose();p.material.dispose()}}
  plotsGroup.children.forEach((g,i)=>{g.position.y=.08+Math.sin(time*.002+i)*.025});renderer.render(scene,camera)}

buildTerrain();rebuildPlots();rebuildBuildings();updateHUD();frameColony();animate(0);
requestAnimationFrame(()=>setTimeout(()=>appLoader?.classList.add('hidden'),700));

// Passive colony income keeps the prototype playable without timers or servers.
setInterval(()=>{if(state.houses.length){state.credits+=state.houses.length*5;saveState();updateHUD()}},5000);
