import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BrowserProvider, Contract, JsonRpcProvider, decodeBytes32String, encodeBytes32String, formatUnits } from 'ethers';
import './style.css';

const CHAIN_ID = 56;
const CHAIN_HEX = '0x38';
const RPC_URL = 'https://bsc-rpc.publicnode.com';
const HOUSE_CONTRACT = '0x134934B2E182f1F3D0fa2499c91bCA2eB05A852c';
const SPCXB_CONTRACT = '0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1';
const DEV_WALLET = '0x15eB7CEf7684524d600F87fF402B017D37139C36';
const HOUSE_PRICE = 2n * 10n ** 16n;
const HOUSE_ABI = [
  'function mintHouse(bytes32 plotId,uint8 model) returns(uint256)',
  'function ownerOfPlot(bytes32 plotId) view returns(address)',
  'function houseInfo(uint256 tokenId) view returns(bytes32 plotId,uint8 model,address owner)',
  'function totalHousesMinted() view returns(uint256)',
  'function paused() view returns(bool)',
  'event HouseMinted(address indexed buyer,uint256 indexed tokenId,bytes32 indexed plotId,uint8 model,uint256 price)'
];
const TOKEN_ABI = [
  'function balanceOf(address) view returns(uint256)',
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)'
];
const publicProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork:true });
const readHouse = new Contract(HOUSE_CONTRACT, HOUSE_ABI, publicProvider);
let walletProvider=null, walletSigner=null, walletAccount='', txPending=false;

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
const propertyEyebrow = document.querySelector('#propertyEyebrow');
const propertyNote = document.querySelector('#propertyNote');
const walletButton = document.querySelector('#walletButton');
const chainBadge = document.querySelector('#chainBadge');

const BUILDINGS = {
  habitat: { name: '阿瑞斯栖息舱', model:0, people: 12, oxygen: 8 },
  dome: { name: '生命穹顶', model:1, people: 20, oxygen: 5 },
  tower: { name: '赫利俄斯高塔', model:2, people: 32, oxygen: -4 },
  greenhouse: { name: '伊甸温室', model:3, people: 8, oxygen: 18 },
  reactor: { name: '聚变反应堆', model:4, people: 6, oxygen: 4 },
  observatory: { name: '开普勒观测站', model:5, people: 10, oxygen: -2 },
  solar: { name: '索利斯太阳能场', model:6, people: 2, oxygen: 0 },
};
const BUILDING_BY_MODEL=Object.fromEntries(Object.entries(BUILDINGS).map(([id,data])=>[data.model,id]));
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
const GENESIS_HOUSES = [
  { plot:'LOT--1--1',type:'habitat',wallet:DEV_WALLET,source:'visual-genesis' },
  { plot:'LOT--1-0',type:'dome',wallet:DEV_WALLET,source:'visual-genesis' },
  { plot:'LOT-0--1',type:'greenhouse',wallet:DEV_WALLET,source:'visual-genesis' },
  { plot:'LOT-1-0',type:'tower',wallet:DEV_WALLET,source:'visual-genesis' },
  { plot:'LOT-0-1',type:'solar',wallet:DEV_WALLET,source:'visual-genesis' }
];
const defaultState = { version:6, expansions:0, generatedRadius:6, revealed:initialRevealed, houses:GENESIS_HOUSES };
let state=structuredClone(defaultState);
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
function shortAddress(address){return address?`${address.slice(0,6)}…${address.slice(-4)}`:'—'}
async function openPropertyModal(record){
  const building=BUILDINGS[record.type]||BUILDINGS.habitat;
  propertyType.textContent=building.name;propertyWallet.textContent=record.wallet||DEV_WALLET;propertyParcel.textContent=record.plot;
  if(record.source==='visual-genesis'){
    propertyEyebrow.textContent='创世视觉房屋 // 开发者所有';propertyBlock.textContent='—';propertyStatus.textContent='视觉创世';
    propertyNote.textContent='这五座初始房屋属于城市的视觉创世状态，并非已铸造的链上 NFT。';
  }else{
    propertyEyebrow.textContent='链上房产 // BNB MAINNET';propertyBlock.textContent=record.blockNumber?`#${Number(record.blockNumber).toLocaleString('en-US')}`:'正在读取';propertyStatus.textContent='链上确认';
    propertyNote.textContent='所有权直接读取自 BNB Mainnet 的 Mars City House 合约。';
    try{const owner=await readHouse.ownerOfPlot(encodeBytes32String(record.plot));if(owner!=='0x0000000000000000000000000000000000000000'){record.wallet=owner;propertyWallet.textContent=owner}}
    catch{propertyStatus.textContent='RPC 暂时不可用'}
  }
  propertyModal.classList.add('open');propertyModal.setAttribute('aria-hidden','false');
}
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
function updateBuildButton(){buildPrice.textContent='0.02 SPCXB';buildButton.disabled=txPending;buildButton.querySelector('span').textContent=txPending?'交易处理中':walletAccount?'购买并铸造':'连接钱包并购买'}
async function switchToBsc(){
  const ethereum=window.ethereum;if(!ethereum)throw new Error('请安装支持 BNB Chain 的钱包');
  try{await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]})}
  catch(error){if(error.code!==4902)throw error;await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:'BNB Smart Chain',nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:[RPC_URL],blockExplorerUrls:['https://bscscan.com']} ]})}
}
async function refreshWalletBalance(){
  if(!walletAccount){creditsEl.textContent='—';return}
  try{const token=new Contract(SPCXB_CONTRACT,TOKEN_ABI,walletProvider);const balance=await token.balanceOf(walletAccount);creditsEl.textContent=Number(formatUnits(balance,18)).toLocaleString('en-US',{maximumFractionDigits:2})}
  catch{creditsEl.textContent='RPC 错误'}
}
async function connectWallet(){
  if(!window.ethereum)throw new Error('未检测到钱包');
  await switchToBsc();
  const accounts=await window.ethereum.request({method:'eth_requestAccounts'});if(!accounts?.[0])throw new Error('钱包未授权');
  walletProvider=new BrowserProvider(window.ethereum);walletSigner=await walletProvider.getSigner();walletAccount=await walletSigner.getAddress();
  walletButton.textContent=shortAddress(walletAccount);walletButton.classList.add('connected');updateBuildButton();await refreshWalletBalance();
  if(!window.__marsWalletListeners){
    window.__marsWalletListeners=true;
    window.ethereum.on?.('accountsChanged',accounts=>{walletAccount=accounts?.[0]||'';walletSigner=null;walletButton.textContent=walletAccount?shortAddress(walletAccount):'连接钱包';updateBuildButton();refreshWalletBalance()});
    window.ethereum.on?.('chainChanged',()=>{walletAccount='';walletSigner=null;walletButton.textContent='连接钱包';creditsEl.textContent='—';updateBuildButton()});
  }
}
walletButton.addEventListener('click',()=>connectWallet().catch(error=>showToast(error.shortMessage||error.message||'钱包连接失败')));
buildButton.addEventListener('click',async()=>{
  if(txPending||!selectedPlot||state.houses.some(h=>h.plot===selectedPlot.id))return;
  const builtPlot=selectedPlot,type=BUILDINGS[selectedType],plotBytes=encodeBytes32String(builtPlot.id);
  try{
    txPending=true;updateBuildButton();
    if(!walletAccount)await connectWallet();
    await switchToBsc();walletProvider=new BrowserProvider(window.ethereum);walletSigner=await walletProvider.getSigner();walletAccount=await walletSigner.getAddress();
    const house=new Contract(HOUSE_CONTRACT,HOUSE_ABI,walletSigner),token=new Contract(SPCXB_CONTRACT,TOKEN_ABI,walletSigner);
    if(await house.paused())throw new Error('合约当前已暂停');
    if((await house.ownerOfPlot(plotBytes))!=='0x0000000000000000000000000000000000000000')throw new Error('该地块已在链上铸造');
    const balance=await token.balanceOf(walletAccount);if(balance<HOUSE_PRICE)throw new Error('SPCXB 余额不足，需要 0.02 SPCXB');
    const allowance=await token.allowance(walletAccount,HOUSE_CONTRACT);
    if(allowance<HOUSE_PRICE){showToast('请在钱包中批准 0.02 SPCXB');const approval=await token.approve(HOUSE_CONTRACT,HOUSE_PRICE);const approved=await approval.wait();if(approved.status!==1)throw new Error('SPCXB 授权失败')}
    showToast('请确认房屋铸造交易');
    const transaction=await house.mintHouse(plotBytes,type.model);const receipt=await transaction.wait();if(receipt.status!==1)throw new Error('房屋铸造失败');
    const minted=receipt.logs.map(log=>{try{return house.interface.parseLog(log)}catch{return null}}).find(log=>log?.name==='HouseMinted');
    if(!minted)throw new Error('未找到 HouseMinted 事件');
    const record={plot:builtPlot.id,type:selectedType,rotation:builtPlot.rotation,wallet:walletAccount,source:'onchain',tokenId:minted.args.tokenId.toString(),txHash:receipt.hash,blockNumber:receipt.blockNumber};
    state.houses.push(record);addBuilding(record,true);pushChainActivity(record);closePanel();saveState();updateHUD();await refreshWalletBalance();showToast(`${type.name} 已在链上铸造`);checkExpansion(builtPlot);
  }catch(error){showToast(error.code===4001||error.code==='ACTION_REJECTED'?'交易已取消':error.shortMessage||error.reason||error.message||'交易失败')}
  finally{txPending=false;updateBuildButton()}
});
function stats(){return state.houses.reduce((sum,h)=>{const b=BUILDINGS[h.type]||BUILDINGS.habitat;sum.people+=b.people;sum.oxygen+=b.oxygen;return sum},{people:0,oxygen:100})}
function updateHUD(){const s=stats(),radius=mapRadius();populationEl.textContent=s.people.toLocaleString('en-US');oxygenEl.textContent=`${Math.max(0,s.oxygen)}%`;levelEl.textContent=String(state.expansions+1).padStart(2,'0');missionTitle.textContent='扩展城市边界';missionText.textContent='使用 SPCXB 铸造房屋，新的地块将从迷雾中显现。';progressText.textContent=`${state.houses.length} 个模块 · 半径 ${radius} 米`;progressBar.style.width=`${Math.min(100,35+state.expansions*8)}%`;updateBuildButton()}
function checkExpansion(plot){
  if(!plot.edge)return;
  const newly=[];
  [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dz])=>{const gx=plot.gx+dx,gz=plot.gz+dz,key=cellKey(gx,gz);if(!state.revealed.includes(key)){state.revealed.push(key);newly.push(key)}});
  if(!newly.length)return;
  state.expansions++;
  const furthest=Math.max(...state.revealed.map(key=>Math.max(...key.split(':').map(Number).map(Math.abs))));
  if(furthest>=state.generatedRadius-1)state.generatedRadius+=4;
  generatePlotCatalog();saveState();buildTerrain(newly);rebuildPlots();rebuildBuildings();frameColony();showToast(`${newly.length} 个新区域从迷雾中显现`);updateHUD();
}
function frameColony(){const r=mapRadius();controls.target.set(0,0,0);const dir=camera.position.clone().sub(controls.target).normalize();const portraitFit=camera.aspect<.75?1.64:1;camera.position.copy(controls.target).add(dir.multiplyScalar((22+r*1.12)*portraitFit));controls.update()}
function saveState(){}
let toastTimer;function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2100)}
const shownChainEvents=new Set();
function makeActivity(record,label='链上确认'){
  const item=document.createElement('article'),building=BUILDINGS[record.type]||BUILDINGS.habitat,isGenesis=record.source==='visual-genesis',isReceipt=Boolean(record.txHash);
  item.className='tx-item';
  const top=document.createElement('div');top.className='tx-item__top';const owner=document.createElement('b');owner.textContent=shortAddress(record.wallet);const amount=document.createElement('span');amount.textContent=isGenesis?'创世视觉':isReceipt?'−0.02 SPCXB':`NFT #${record.tokenId}`;top.append(owner,amount);
  const text=document.createElement('p');text.textContent=`${isGenesis?'展示':isReceipt?'购买了':'拥有'} ${building.name}`;
  const bottom=document.createElement('div');bottom.className='tx-item__bottom';const block=document.createElement('span');block.textContent=record.blockNumber?`区块 ${Number(record.blockNumber).toLocaleString('en-US')}`:record.plot;const status=document.createElement('em');status.textContent=label;bottom.append(block,status);
  item.append(top,text,bottom);return item;
}
function pushChainActivity(record){const key=record.txHash||(record.source==='visual-genesis'?`genesis:${record.plot}`:`state:${record.tokenId}`);if(shownChainEvents.has(key))return;shownChainEvents.add(key);txFeed.prepend(makeActivity(record,record.source==='visual-genesis'?'非链上 NFT':record.txHash?'链上确认':'链上状态'));while(txFeed.children.length>8)txFeed.lastElementChild.remove()}
function parsePlotCoordinates(plotName){
  const match=/^LOT-(-?\d+)-(-?\d+)$/.exec(plotName);if(!match||match[1].length>16||match[2].length>16)return null;
  const gx=Number(match[1]),gz=Number(match[2]);return Number.isSafeInteger(gx)&&Number.isSafeInteger(gz)?{gx,gz}:null;
}
function revealRecordedPlot(plotName){
  const coordinates=parsePlotCoordinates(plotName);if(!coordinates)return false;
  const {gx,gz}=coordinates;let changed=false;
  [[0,0],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dz])=>{const key=cellKey(gx+dx,gz+dz);if(!state.revealed.includes(key)){state.revealed.push(key);changed=true}});
  const needed=Math.max(Math.abs(gx),Math.abs(gz))+4;if(needed>state.generatedRadius){state.generatedRadius=needed;changed=true}
  return changed;
}
let lastSyncedTotal=0;
let chainSyncPending=false;
async function syncChainState(){
  if(chainSyncPending)return;chainSyncPending=true;
  try{
    const [latest,totalValue]=await Promise.all([publicProvider.getBlockNumber(),readHouse.totalHousesMinted()]);
    const total=Number(totalValue),start=lastSyncedTotal?lastSyncedTotal+1:1,syncEnd=Math.min(total,start+99);let changed=false;
    for(let first=start;first<=syncEnd;first+=20){
      const ids=Array.from({length:Math.min(20,syncEnd-first+1)},(_,index)=>first+index);
      const infos=await Promise.all(ids.map(id=>readHouse.houseInfo(id)));
      infos.forEach((info,index)=>{
        let plot;try{plot=decodeBytes32String(info.plotId)}catch{return}
        const coordinates=parsePlotCoordinates(plot);if(!coordinates||!isRevealed(coordinates.gx,coordinates.gz))return;
        const tokenId=String(ids[index]),type=BUILDING_BY_MODEL[Number(info.model)]||'habitat';
        const genesisIndex=state.houses.findIndex(h=>h.source==='visual-genesis'&&h.plot===plot);
        if(genesisIndex>=0){state.houses.splice(genesisIndex,1);changed=true}
        let record=state.houses.find(h=>h.source==='onchain'&&h.tokenId===tokenId);
        if(!record){record={plot,type,wallet:info.owner,source:'onchain',tokenId};state.houses.push(record);changed=true}
        else if(record.wallet.toLowerCase()!==info.owner.toLowerCase()||record.plot!==plot||record.type!==type){Object.assign(record,{plot,type,wallet:info.owner});changed=true}
        changed=revealRecordedPlot(plot)||changed;pushChainActivity(record);
      });
    }
    lastSyncedTotal=Math.max(lastSyncedTotal,syncEnd);feedBlock.textContent=`#${latest.toLocaleString('en-US')}`;feedPlayers.textContent=String(total);feedVolume.textContent=`${(total*0.02).toLocaleString('en-US',{maximumFractionDigits:2})} SPCXB`;chainBadge.textContent='链上';chainBadge.classList.remove('offline');
    if(changed){generatePlotCatalog();saveState();buildTerrain();rebuildPlots();rebuildBuildings();updateHUD()}
  }catch{chainBadge.textContent='RPC 离线';chainBadge.classList.add('offline')}
  finally{chainSyncPending=false}
}
GENESIS_HOUSES.forEach(pushChainActivity);
syncChainState();setInterval(syncChainState,20000);
document.querySelector('#resetButton').addEventListener('click',()=>{state=structuredClone(defaultState);lastSyncedTotal=0;generatePlotCatalog();buildTerrain();rebuildPlots();rebuildBuildings();updateHUD();frameColony();showToast('正在从链上重新同步城市');syncChainState()});

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
