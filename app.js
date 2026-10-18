import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = (s) => document.querySelector(s);
const state = { color:'black', finish:'matte', hardware:'onyx', size:'cabin', monogram:'MG', showMonogram:true, tag:false };
const palette = {
  black:{name:'Midnight black',hex:0x252725,label:'01 — MIDNIGHT'},
  cream:{name:'Oat cream',hex:0xded4c2,label:'02 — OAT'},
  sage:{name:'Sage green',hex:0x9ca58d,label:'03 — SAGE'},
  navy:{name:'Deep ocean',hex:0x34475b,label:'04 — OCEAN'},
  terracotta:{name:'Burnt sienna',hex:0xad6854,label:'05 — SIENNA'}
};
const hardwarePalette = {onyx:0x30312e,silver:0xb7b8b3,gold:0xc5aa70};
const sizeConfig = {
  cabin:{name:'Cabin',price:8999,scale:1,dimensions:'55 × 35 × 23 cm'},
  medium:{name:'Medium',price:11999,scale:1.17,dimensions:'66 × 45 × 27 cm'},
  large:{name:'Large',price:14999,scale:1.32,dimensions:'76 × 51 × 30 cm'}
};
let scene, camera, renderer, controls, suitcase, shellMaterial, hardwareMaterial, shellGroup, monogramMesh, tagGroup, resizeObserver, cameraTween=null, groundPlane;
let toastTimer;

function showToast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function roundedBox(parent, name, size, position, material, radius=.08, segments=3) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0],size[1],size[2],segments,radius),material);
  mesh.name=name; mesh.position.set(...position); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function makeMaterial(color, roughness=.48, metalness=.04) {
  return new THREE.MeshStandardMaterial({color,roughness,metalness});
}
function makeShellMaterial(color) {
  const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#b0b0b0'; ctx.fillRect(0,0,256,256);
  // Fine, low-contrast molded-polymer grain: visible in highlights, never noisy.
  for(let i=0;i<1800;i++){const x=Math.random()*256,y=Math.random()*256,a=.025+Math.random()*.055;ctx.fillStyle='rgba(255,255,255,'+a+')';ctx.fillRect(x,y,1,1);}
  for(let y=0;y<256;y+=4){ctx.fillStyle='rgba(0,0,0,0.018)';ctx.fillRect(0,y,256,1);}
  const grain=new THREE.CanvasTexture(canvas); grain.wrapS=grain.wrapT=THREE.RepeatWrapping; grain.repeat.set(2,2); grain.colorSpace=THREE.NoColorSpace;
  return new THREE.MeshStandardMaterial({color,roughness:.52,metalness:.045,bumpMap:grain,bumpScale:.018});
}
function makeMonogramTexture(text) {
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=256;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,512,256);
  ctx.fillStyle='#e9e2d0'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='italic 112px Georgia'; ctx.fillText((text||'').slice(0,3).toUpperCase(),256,128);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;
}
function updateMonogram() {
  if (!monogramMesh) return;
  const visible=state.showMonogram && state.monogram.trim().length>0;
  monogramMesh.visible=visible;
  if (visible) {
    const old=monogramMesh.material.map;
    monogramMesh.material.map=makeMonogramTexture(state.monogram);
    monogramMesh.material.needsUpdate=true;
    if(old) old.dispose();
  }
  if(tagGroup) tagGroup.visible=state.tag;
  $('#monogramPreview').textContent=state.showMonogram && state.monogram.trim()?state.monogram.toUpperCase():'—';
}
function buildSuitcase() {
  suitcase = new THREE.Group(); scene.add(suitcase);
  shellGroup = new THREE.Group(); suitcase.add(shellGroup);
  shellMaterial=makeShellMaterial(palette[state.color].hex);
  hardwareMaterial=makeMaterial(hardwarePalette[state.hardware],.28,.62);
  const rubber=makeMaterial(0x242521,.8,.03);
  const trim=makeMaterial(0x4b4d46,.42,.28);
  // Replacement cabin-case shell: beveled extruded clamshells, continuous zipper frame,
  // and molded ribs adapted from the uploaded cabin-case.html model.
  function caseRoundRect(w,h,r){
    const sh=new THREE.Shape(),x=-w/2,y=-h/2;
    r=Math.max(.02,Math.min(r,w/2-.02,h/2-.02));
    sh.moveTo(x+r,y);sh.lineTo(x+w-r,y);sh.absarc(x+w-r,y+r,r,-Math.PI/2,0,false);
    sh.lineTo(x+w,y+h-r);sh.absarc(x+w-r,y+h-r,r,0,Math.PI/2,false);
    sh.lineTo(x+r,y+h);sh.absarc(x+r,y+h-r,r,Math.PI/2,Math.PI,false);
    sh.lineTo(x,y+r);sh.absarc(x+r,y+r,r,Math.PI,Math.PI*1.5,false);return sh;
  }
  function caseShellHalf(depth, bevel, z, flip=false){
    const geo=new THREE.ExtrudeGeometry(caseRoundRect(2.00,2.80,.20),{
      depth:Math.max(.02,depth-2*bevel),bevelEnabled:true,bevelThickness:bevel,
      bevelSize:bevel,bevelSegments:5,curveSegments:10
    });
    geo.translate(0,0,-(depth-2*bevel)/2);
    const mesh=new THREE.Mesh(geo,shellMaterial);mesh.position.set(0,.05,z);
    if(flip)mesh.rotation.y=Math.PI;
    mesh.castShadow=true;mesh.receiveShadow=true;shellGroup.add(mesh);return mesh;
  }
  caseShellHalf(.39,.055,-.19,true);
  caseShellHalf(.39,.055,.19,false);
  // Recessed perimeter band and zipper line follow the rounded clamshell silhouette.
  function caseFrame(w,h,outerR,innerW,innerH,innerR,depth,mat,z){
    const shape=caseRoundRect(w,h,outerR);shape.holes.push(caseRoundRect(innerW,innerH,innerR));
    const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:12});
    geo.translate(0,0,-depth/2);const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(0,.05,z);mesh.castShadow=true;mesh.receiveShadow=true;shellGroup.add(mesh);return mesh;
  }
  caseFrame(2.035,2.835,.23,1.91,2.71,.17,.035,trim,0);
  caseFrame(2.025,2.825,.22,1.94,2.74,.18,.018,rubber,.025);
  // Broad, softly rounded molded ribs echo the uploaded model's integrated front panel.
  for(let i=0;i<8;i++){
    const x=(i-3.5)*.245;
    roundedBox(shellGroup,'uploaded-model molded shell rib',[.105,2.54,.035],[x,.05,.405],shellMaterial,.052,8);
  }
  // Curved-looking protective corner guards: layered rubber bed, beveled metal cap and slotted rivets.
  for(const sx of [-1,1]){
    for(const sy of [-1,1]){
      const gy=.05+sy*1.265, gx=sx*.875;
      const bed=roundedBox(shellGroup,'corner guard recessed gasket',[.20,.27,.035],[gx,gy,.302],rubber,.065,8);
      bed.rotation.z=sx*sy*.18;
      const guard=roundedBox(shellGroup,'beveled wrap corner guard',[.17,.24,.035],[gx,gy,.326],hardwareMaterial,.065,8);
      guard.rotation.z=sx*sy*.18;
      for(const dy of [-.072,.072]){
        const rivet=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.012,16),trim);
        rivet.rotation.x=Math.PI/2;rivet.position.set(gx,gy+dy,.348);shellGroup.add(rivet);
        roundedBox(shellGroup,'rivet slot',[.010,.003,.002],[gx,gy+dy,.356],rubber,.001,1);
      }
    }
  }
  // A finished rear panel keeps the 180-degree view as considered as the front.
  roundedBox(shellGroup,'rear inset',[1.88,2.64,.035],[0,.05,-.395],shellMaterial,.105,5);
  for(let i=0;i<5;i++){
    const x=-.64+i*.32;
    roundedBox(shellGroup,'rear shell rib',[.022,2.30,.012],[x,.05,-.418],trim,.01,2);
  }
  roundedBox(shellGroup,'rear ID plate',[.46,.25,.025],[0,.68,-.425],hardwareMaterial,.035,4);
  roundedBox(shellGroup,'rear plate inset',[.38,.17,.012],[0,.68,-.444],trim,.02,3);
  for(const side of [-1,1]){
    roundedBox(shellGroup,'side bumper',[.06,2.65,.08],[side*1.025,.05,.02],hardwareMaterial,.025,3);
    roundedBox(shellGroup,'zipper line',[.025,2.73,.035],[side*1.055,.05,-.04],trim,.012,2);
  }
  // Four realistic twin-spinner caster modules with rubber tires, recessed hubs and a compact swivel mount.
  const tireMaterial=makeMaterial(0x20211f,.88,.01);
  const sidewallMaterial=makeMaterial(0x343530,.78,.015);
  const wheelAccent=makeMaterial(0x77776f,.38,.42);
  for(const x of [-.79,.79]){
    for(const z of [-.22,.22]){
      const wheelGroup=new THREE.Group(); wheelGroup.position.set(x,-1.46,z); shellGroup.add(wheelGroup);
      // Swivel plate and fork sit above the axle, rather than appearing as a block through the wheels.
      const mount=roundedBox(wheelGroup,'spinner mounting plate',[.22,.055,.22],[0,.205,0],trim,.035,6);
      const swivel=new THREE.Mesh(new THREE.CylinderGeometry(.072,.078,.065,32),hardwareMaterial);
      swivel.position.set(0,.16,0); swivel.castShadow=true; wheelGroup.add(swivel);
      const pivotCap=new THREE.Mesh(new THREE.CylinderGeometry(.038,.038,.072,24),wheelAccent);
      pivotCap.position.set(0,.13,0); wheelGroup.add(pivotCap);
      const forkTop=roundedBox(wheelGroup,'curved caster fork crown',[.18,.095,.20],[0,.075,0],hardwareMaterial,.045,8);
      for(const offset of [-.085,.085]){
        // Each roller is a separate thick tire, with a softened outer edge and a visible sidewall.
        const tire=new THREE.Mesh(new THREE.CylinderGeometry(.118,.118,.078,40,1,false),tireMaterial);
        tire.rotation.x=Math.PI/2; tire.position.set(0,-.055,offset); tire.castShadow=true; tire.receiveShadow=true; wheelGroup.add(tire);
        const shoulder=new THREE.Mesh(new THREE.TorusGeometry(.104,.012,8,40),sidewallMaterial);
        shoulder.position.set(0,-.055,offset+(offset>0?.041:-.041)); wheelGroup.add(shoulder);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.071,.071,.084,32),hardwareMaterial);
        hub.rotation.x=Math.PI/2; hub.position.set(0,-.055,offset+(offset>0?.044:-.044)); wheelGroup.add(hub);
        const hubInset=new THREE.Mesh(new THREE.CylinderGeometry(.050,.050,.087,32),sidewallMaterial);
        hubInset.rotation.x=Math.PI/2; hubInset.position.set(0,-.055,offset+(offset>0?.047:-.047)); wheelGroup.add(hubInset);
        const bearing=new THREE.Mesh(new THREE.CylinderGeometry(.027,.027,.091,24),wheelAccent);
        bearing.rotation.x=Math.PI/2; bearing.position.set(0,-.055,offset+(offset>0?.049:-.049)); wheelGroup.add(bearing);
        const axleCap=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.094,20),hardwareMaterial);
        axleCap.rotation.x=Math.PI/2; axleCap.position.set(0,-.055,offset+(offset>0?.051:-.051)); wheelGroup.add(axleCap);
        // Fine circumferential tread grooves catch highlights without looking like toy wheels.
        for(let groove=0;groove<3;groove++){
          const treadLine=new THREE.Mesh(new THREE.TorusGeometry(.114,.0028,4,40),sidewallMaterial);
          treadLine.position.set(0,-.055,offset+(offset>0?.012:-.012)+(groove-1)*.018);
          wheelGroup.add(treadLine);
        }
      }
      // Fork cheeks wrap the outside edges of the twin rollers and expose the axle area.
      for(const side of [-1,1]){
        const cheek=roundedBox(wheelGroup,'spinner fork cheek',[.16,.16,.035],[0,-.045,side*.145],hardwareMaterial,.035,8);
        cheek.rotation.x=side*.06;
        const axleBolt=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.012,20),wheelAccent);
        axleBolt.rotation.x=Math.PI/2; axleBolt.position.set(0,-.055,side*.168); wheelGroup.add(axleBolt);
        const boltSlot=roundedBox(wheelGroup,'caster axle bolt slot',[.012,.003,.002],[0,-.055,side*.176],rubber,.001,1);
      }
    }
  }
  // Telescopic rails and the carry handle.
  for(const x of [-.28,.28]){
    roundedBox(shellGroup,'telescopic rail',[.055,.73,.06],[x,1.78,-.08],hardwareMaterial,.025,3);
    roundedBox(shellGroup,'rail socket',[.12,.17,.09],[x,1.40,-.045],trim,.025,3);
  }
  // Refined telescopic handle assembly: ergonomic palm contour, layered grip surfaces,
  // articulated mounts, precision collars and visible fastener details.
  for(const sx of [-1,1]){
    // Exposed upper rail sleeves make the transition from shell to grip feel engineered.
    roundedBox(shellGroup,'upper rail sleeve',[.072,.32,.078],[sx*.28,1.99,-.08],hardwareMaterial,.025,4);
    roundedBox(shellGroup,'rail sleeve inset',[.035,.22,.012],[sx*.28,1.99,-.035],trim,.012,3);
    roundedBox(shellGroup,'rail collar',[.13,.105,.12],[sx*.28,1.805,-.065],hardwareMaterial,.025,4);
    roundedBox(shellGroup,'collar accent band',[.135,.025,.124],[sx*.28,1.805,-.065],trim,.008,3);
    // Reinforced feet and small metal screws at the shell connection.
    roundedBox(shellGroup,'handle mounting foot',[.22,.13,.12],[sx*.28,1.43,-.015],hardwareMaterial,.035,4);
    roundedBox(shellGroup,'mounting foot gasket',[.235,.045,.13],[sx*.28,1.365,-.015],rubber,.018,3);
    for(const dx of [-.065,.065]){
      const screw=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.012,16),trim);
      screw.rotation.x=Math.PI/2; screw.position.set(sx*.28+dx,1.43,.052); shellGroup.add(screw);
      const slot=roundedBox(shellGroup,'fastener slot',[.014,.003,.002],[sx*.28+dx,1.43,.061],rubber,.001,1);
    }
    // Small angled braces visually connect each rail to the handle bridge.
    const brace=roundedBox(shellGroup,'handle support brace',[.07,.22,.075],[sx*.28,2.095,-.075],hardwareMaterial,.025,4);
    brace.rotation.z=-sx*.16;
  }
  roundedBox(shellGroup,'handle bridge',[.82,.13,.22],[0,2.13,-.08],hardwareMaterial,.06,6);
  roundedBox(shellGroup,'handle bridge inset',[.70,.075,.225],[0,2.16,-.08],trim,.035,5);
  // Palm-friendly grip uses a broad soft-touch center with gently raised, rounded end lobes.
  roundedBox(shellGroup,'sleek ergonomic palm grip',[.60,.125,.18],[0,2.225,-.08],makeMaterial(0x30312e,.58,.025),.058,12);
  roundedBox(shellGroup,'fine grip comfort inset',[.38,.012,.095],[0,2.278,-.08],makeMaterial(0x393a35,.68,.01),.008,8);
  // Five subtle tactile lines keep the grip practical without looking chunky.
  for(let i=0;i<5;i++){
    const gx=-.10+i*.05;
    roundedBox(shellGroup,'fine grip texture line',[.003,.002,.052],[gx,2.285,-.08],trim,.001,2);
  }
  for(const sx of [-1,1]){
    roundedBox(shellGroup,'slim grip end cap',[.04,.085,.15],[sx*.31,2.225,-.08],hardwareMaterial,.02,8);
    roundedBox(shellGroup,'end cap hairline seam',[.004,.045,.10],[sx*.333,2.225,-.08],trim,.002,3);
  }
  // Minimal handle finish: keep the grip clean, sleek and visually light.
  roundedBox(shellGroup,'handle center badge',[.085,.022,.008],[0,2.245,.018],hardwareMaterial,.008,5);
  // Side carry handles with recessed mounting plates and soft-touch grips.
  for(const sx of [-1,1]){
    roundedBox(shellGroup,'side handle mounting plate',[.075,.58,.22],[sx*1.025,.30,-.015],hardwareMaterial,.045,5);
    roundedBox(shellGroup,'side handle gasket',[.045,.49,.19],[sx*1.065,.30,-.015],rubber,.035,4);
    roundedBox(shellGroup,'side handle grip',[.105,.38,.16],[sx*1.105,.30,-.015],makeMaterial(0x4a4b46,.7,.03),.05,5);
    for(let i=0;i<3;i++){
      roundedBox(shellGroup,'side grip texture',[.012,.035,.012],[sx*1.163,.20+i*.10,-.015],trim,.005,2);
    }
    for(const sy of [-1,1]){
      const pin=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.012,16),trim);
      pin.rotation.z=Math.PI/2; pin.position.set(sx*1.16,.30+sy*.225,-.015); shellGroup.add(pin);
    }
  }
  // Top carry handle: recessed bed, padded bridge grip, metallic end mounts and button detail.
  roundedBox(shellGroup,'top handle recessed bed',[.78,.035,.30],[0,1.515,-.015],trim,.09,5);
  roundedBox(shellGroup,'top handle inner recess',[.64,.025,.22],[0,1.535,-.015],rubber,.065,4);
  roundedBox(shellGroup,'top handle left mount',[.15,.11,.24],[-.29,1.565,-.015],hardwareMaterial,.035,4);
  roundedBox(shellGroup,'top handle right mount',[.15,.11,.24],[.29,1.565,-.015],hardwareMaterial,.035,4);
  roundedBox(shellGroup,'top handle grip',[.56,.10,.17],[0,1.625,-.015],makeMaterial(0x555650,.64,.06),.045,6);
  roundedBox(shellGroup,'top handle comfort inset',[.38,.018,.105],[0,1.681,-.015],rubber,.025,4);
  for(let i=0;i<7;i++){
    roundedBox(shellGroup,'top grip texture rib',[.012,.004,.07],[-.15+i*.05,1.692,-.015],trim,.002,2);
  }
  // Shock-absorbing corner lugs near the lower shell: layered rubber and metal protectors.
  for(const sx of [-1,1]){
    for(const sz of [-1,1]){
      const lug=roundedBox(shellGroup,'shock absorbing corner lug',[.16,.30,.11],[sx*.94,-1.12,sz*.365],rubber,.055,5);
      lug.rotation.z=-sx*.10;
      const lugCap=roundedBox(shellGroup,'corner lug cap',[.12,.23,.035],[sx*.94,-1.12,sz*.423],hardwareMaterial,.045,5);
      lugCap.rotation.z=-sx*.10;
      for(const sy of [-1,1]){
        const lugRivet=new THREE.Mesh(new THREE.SphereGeometry(.014,12,10),trim);
        lugRivet.position.set(sx*.94,-1.12+sy*.085,sz*.448); shellGroup.add(lugRivet);
      }
    }
  }
  // TSA-style three-dial combination lock is positioned on the SIDE, beside the zipper seam.
  // The lock face is rotated onto the right side plane instead of sitting on the front panel.
  roundedBox(shellGroup,'side TSA lock backing',[.075,.27,.39],[1.075,.67,.10],trim,.045,5);
  roundedBox(shellGroup,'side TSA lock housing',[.055,.24,.35],[1.12,.67,.10],hardwareMaterial,.04,5);
  roundedBox(shellGroup,'side TSA lock face',[.018,.19,.29],[1.153,.67,.10],makeMaterial(0xaaa99f,.38,.38),.025,4);
  roundedBox(shellGroup,'side TSA lock brand mark',[.008,.025,.075],[1.166,.735,.10],trim,.006,2);
  for(let i=0;i<3;i++){
    roundedBox(shellGroup,'side combination dial',[.018,.075,.055],[1.166,.635,.015+i*.085],rubber,.012,3);
    roundedBox(shellGroup,'side dial highlight',[.006,.008,.028],[1.178,.635,.028+i*.085],hardwareMaterial,.003,2);
  }
  // Paired metal zipper pulls sit beside the lock along the side seam.
  for(let i=0;i<2;i++){
    const pz=.31+i*.075, py=.88-i*.035;
    const pullLoop=new THREE.Mesh(new THREE.TorusGeometry(.027,.007,8,20),hardwareMaterial);
    pullLoop.rotation.y=Math.PI/2; pullLoop.position.set(1.09,py,pz); shellGroup.add(pullLoop);
    const pullTab=roundedBox(shellGroup,'side zipper pull tab',[.025,.13,.035],[1.105,py-.065,pz],hardwareMaterial,.012,4);
    pullTab.rotation.z=-.10;
    const pullHole=new THREE.Mesh(new THREE.TorusGeometry(.008,.0025,6,12),trim);
    pullHole.rotation.y=Math.PI/2; pullHole.position.set(1.122,py-.10,pz); shellGroup.add(pullHole);
  }
  // Molded scratch-resistant shell texture and crisp perimeter seam remain visible in highlights.
  // Small centered badge, above the monogram.
  // Flush, inset brand plaque: embed it into the shell skin so no visible air gap remains.
  roundedBox(shellGroup,'brand badge recessed pocket',[.37,.13,.028],[0,.91,.414],rubber,.028,5);
  roundedBox(shellGroup,'brand badge metal rim',[.345,.108,.018],[0,.91,.432],hardwareMaterial,.022,5);
  roundedBox(shellGroup,'brand badge face',[.323,.087,.012],[0,.91,.444],makeMaterial(0x252725,.42,.25),.018,5);
  const badgeTexture = new THREE.CanvasTexture(makeBadgeCanvas()); badgeTexture.colorSpace=THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(.302,.064),new THREE.MeshBasicMaterial({map:badgeTexture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  badge.position.set(0,.91,.451); shellGroup.add(badge);
  // Monogram sits on the front face.
  const monoMat=new THREE.MeshBasicMaterial({map:makeMonogramTexture(state.monogram),transparent:true,depthWrite:false,side:THREE.DoubleSide});
  monogramMesh=new THREE.Mesh(new THREE.PlaneGeometry(.67,.34),monoMat); monogramMesh.position.set(0,.45,.475); shellGroup.add(monogramMesh);
  // Optional hanging luggage tag with a fine loop.
  tagGroup=new THREE.Group(); shellGroup.add(tagGroup);
  const cord=new THREE.Mesh(new THREE.TorusGeometry(.095,.012,8,28,Math.PI*1.45),hardwareMaterial);
  cord.position.set(.80,.84,.47); cord.rotation.z=-.35; tagGroup.add(cord);
  const tag=roundedBox(tagGroup,'luggage tag',[.25,.39,.045],[.83,.56,.49],makeMaterial(0x9b8064,.7,.02),.035,4);
  const tagMark=new THREE.Mesh(new THREE.PlaneGeometry(.15,.13),new THREE.MeshBasicMaterial({map:makeMonogramTexture(state.monogram),transparent:true,depthWrite:false}));
  tagMark.position.set(.83,.57,.516); tagGroup.add(tagMark); tagGroup.userData.tagMark=tagMark;
  tagGroup.visible=state.tag;
  // Source-model details restored from cabin-case.html: central TSA lock,
  // side carry handles, top carry handle, badge and front fasteners.
  const lockBody=roundedBox(shellGroup,'TSA lock housing',[.30,.34,.085],[0,.12,.465],hardwareMaterial,.055,8);
  const lockInset=roundedBox(shellGroup,'TSA lock inset',[.235,.265,.022],[0,.12,.518],trim,.035,6);
  for(let row=0;row<3;row++){
    const dial=roundedBox(shellGroup,'TSA combination dial',[.16,.048,.014],[0,.19-row*.07,.534],makeMaterial(0xc9cbd0,.32,.55),.008,3);
    dial.userData.sourceDetail=true;
  }
  roundedBox(shellGroup,'TSA release button',[.075,.035,.018],[.085,-.005,.535],hardwareMaterial,.012,4);
  // Twin recessed side carry handles, with hinge caps and exposed pivot screws.
  for(const side of [-1,1]){
    const handleBed=roundedBox(shellGroup,'side carry handle recess',[.09,.56,.19],[side*1.025,.05,0],rubber,.06,8);
    handleBed.rotation.y=side*Math.PI/2;
    const handle=roundedBox(shellGroup,'side carry handle grip',[.11,.42,.12],[side*1.075,.05,0],hardwareMaterial,.055,8);
    handle.rotation.y=side*Math.PI/2;
    for(const yy of [-.205,.305]){
      const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.045,24),trim);
      hinge.rotation.z=Math.PI/2;hinge.position.set(side*1.09,yy,0);shellGroup.add(hinge);
      const screw=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.012,16),hardwareMaterial);
      screw.rotation.z=Math.PI/2;screw.position.set(side*1.12,yy,0);shellGroup.add(screw);
    }
  }
  // Top carry handle and molded anchor pads.
  for(const x of [-.31,.31]){
    roundedBox(shellGroup,'top handle anchor',[.19,.12,.14],[x,1.40,.02],trim,.04,5);
    const pivot=new THREE.Mesh(new THREE.CylinderGeometry(.042,.042,.10,24),hardwareMaterial);
    pivot.rotation.z=Math.PI/2;pivot.position.set(x,1.43,.055);shellGroup.add(pivot);
  }
  roundedBox(shellGroup,'top carry handle grip',[.54,.12,.15],[0,1.48,.015],hardwareMaterial,.055,8);
  roundedBox(shellGroup,'front maker badge',[.38,.18,.025],[0,.98,.438],hardwareMaterial,.025,5);
  roundedBox(shellGroup,'badge inset',[.31,.11,.012],[0,.98,.456],trim,.018,4);
  for(const x of [-.84,.84]){
    for(const y of [-1.18,1.18]){
      const fastener=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.012,20),hardwareMaterial);
      fastener.rotation.x=Math.PI/2;fastener.position.set(x,y,.43);shellGroup.add(fastener);
      roundedBox(shellGroup,'fastener slot',[.012,.003,.003],[x,y,.439],rubber,.001,1);
    }
  }
  // Ground shadow plane.
  groundPlane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.14}));
  groundPlane.rotation.x=-Math.PI/2; groundPlane.position.y=-1.68; groundPlane.receiveShadow=true; scene.add(groundPlane);
  updateMonogram();
}
function makeBadgeCanvas(){
  const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
  x.clearRect(0,0,512,128);
  x.fillStyle='#252725';x.fillRect(0,0,512,128);
  x.fillStyle='#f2eadb';x.font='600 45px Arial';x.textAlign='center';x.textBaseline='middle';
  x.fillText('C A S E C R A F T',256,65);return c;
}
function init3D() {
  const stage=$('#viewerStage');
  scene=new THREE.Scene(); scene.background=new THREE.Color('#f1efe8');
  camera=new THREE.PerspectiveCamera(40,stage.clientWidth/stage.clientHeight,.1,100); camera.position.set(3.7,2.25,7.4);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.setSize(stage.clientWidth,stage.clientHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.22;
  renderer.domElement.setAttribute('aria-label','Interactive 3D suitcase preview. Drag to rotate.');
  stage.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.07;
  controls.enablePan=false; controls.minDistance=4.7; controls.maxDistance=10; controls.minPolarAngle=.45; controls.maxPolarAngle=2.15; controls.target.set(0,.18,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0xc8c2b4,2.0));
  const key=new THREE.DirectionalLight(0xfff8e9,3.1);key.position.set(3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;scene.add(key);
  const fill=new THREE.DirectionalLight(0xd8e1ec,1.4);fill.position.set(-4,2,3);scene.add(fill);
  const rimLight=new THREE.DirectionalLight(0xffe5c3,2.4);rimLight.position.set(-2,3,-4);scene.add(rimLight);
  const softbox=new THREE.DirectionalLight(0xffffff,1.0);softbox.position.set(1,1,7);scene.add(softbox);
  buildSuitcase(); applyScale();
  resizeObserver=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});
  resizeObserver.observe(stage);
  const animate=()=>{requestAnimationFrame(animate);if(cameraTween){cameraTween.t+=.055;const t=Math.min(cameraTween.t,1);const ease=1-Math.pow(1-t,3);camera.position.lerpVectors(cameraTween.from,cameraTween.to,ease);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,ease);if(t>=1)cameraTween=null;}controls.update();renderer.render(scene,camera);};animate();
  $('#loadingScene').classList.add('hidden');
}
function applyScale(){
  if(!shellGroup)return;
  // Keep a realistic carry-on silhouette while giving the body more substance front-to-back.
  const sc=sizeConfig[state.size].scale;shellGroup.scale.set(sc,sc,sc*.90);
  if(groundPlane)groundPlane.position.y=-1.68*sc;
  if(controls)controls.target.y=.18*sc;
}
function setView(view, instant=false){
  if(!camera||!controls)return;
  const sc=sizeConfig[state.size].scale;
  const presets={front:new THREE.Vector3(0,1.0,8.2),side:new THREE.Vector3(8.1,1.0,.05),back:new THREE.Vector3(0,1.0,-8.2),threequarter:new THREE.Vector3(4.1,2.35,6.6)};
  const target=new THREE.Vector3(0,.18*sc,0);let pos=presets[view]||presets.threequarter;
  const distance=pos.length();pos=pos.clone().normalize().multiplyScalar(distance/Math.max(1,sc*.86));pos.y=Math.max(pos.y, .3);
  cameraTween={from:camera.position.clone(),to:pos.clone(),targetFrom:controls.target.clone(),targetTo:target,t:instant?1:0};
  if(instant){camera.position.copy(pos);controls.target.copy(target);cameraTween=null;}
  $('#viewSwitcher .selected')?.classList.remove('selected');$(`#viewSwitcher [data-view="${view}"]`)?.classList.add('selected');
  document.querySelectorAll('.view-thumb').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
  const views=['front','side','back','threequarter'];const counter=$('#viewCounter');if(counter)counter.textContent=String(views.indexOf(view)+1).padStart(2,'0')+' / 04';
}
function updateMaterials(){
  if(!shellMaterial||!hardwareMaterial)return;
  shellMaterial.color.setHex(palette[state.color].hex);
  shellMaterial.roughness=state.finish==='matte'?.58:.19;
  shellMaterial.metalness=state.finish==='matte'?.035:.12;
  shellMaterial.needsUpdate=true;
  hardwareMaterial.color.setHex(hardwarePalette[state.hardware]);hardwareMaterial.needsUpdate=true;
  $('#selectedColorName').textContent=palette[state.color].name;
  $('#viewColorLabel').textContent=palette[state.color].label;
  $('#selectedFinishName').textContent=state.finish==='matte'?'Soft matte':'High gloss';
  $('#selectedHardwareName').textContent=state.hardware==='onyx'?'Onyx':state.hardware==='silver'?'Silver':'Champagne';
  $('#colorSwatches .active')?.classList.remove('active');
  $(`[data-color="${state.color}"]`)?.classList.add('active');
  $('#finishOptions .selected')?.classList.remove('selected');
  $(`[data-finish="${state.finish}"]`)?.classList.add('selected');
  $('#hardwareOptions .selected')?.classList.remove('selected');
  $(`[data-hardware="${state.hardware}"]`)?.classList.add('selected');
}
function updatePrice(){
  let total=sizeConfig[state.size].price;
  if(state.finish==='gloss')total+=500;
  if(state.hardware==='silver')total+=300;
  if(state.hardware==='gold')total+=700;
  if(state.tag)total+=499;
  $('#totalPrice').textContent='₹'+total.toLocaleString('en-IN');
  const parts=[[sizeConfig[state.size].name,sizeConfig[state.size].price]];if(state.finish==='gloss')parts.push(['High gloss',500]);if(state.hardware==='silver')parts.push(['Silver hardware',300]);if(state.hardware==='gold')parts.push(['Champagne hardware',700]);if(state.tag)parts.push(['Luggage tag',499]);
  const breakdown=$('#priceBreakdown');if(breakdown)breakdown.textContent=parts.map(p=>p[0]+' ₹'+p[1].toLocaleString('en-IN')).join(' · ');
  $('#sizeOptions .selected')?.classList.remove('selected');
  $(`[data-size="${state.size}"]`)?.classList.add('selected');
  return total;
}
function serialize(){return {color:state.color,finish:state.finish,hardware:state.hardware,size:state.size,monogram:state.monogram,showMonogram:state.showMonogram,tag:state.tag};}
function summaryText(){
  return ['CASECRAFT — CUSTOM SUITCASE','Shade: '+palette[state.color].name,'Finish: '+(state.finish==='matte'?'Soft matte':'High gloss'),'Hardware: '+$('#selectedHardwareName').textContent,'Size: '+sizeConfig[state.size].name+' ('+sizeConfig[state.size].dimensions+')','Monogram: '+(state.showMonogram&&state.monogram.trim()?state.monogram.toUpperCase():'None'),'Personalized luggage tag: '+(state.tag?'Yes':'No'),'Estimated total: '+$('#totalPrice').textContent,'','Created with CaseCraft configurator demo.'].join('\n');
}
function openModal(){
  try { localStorage.setItem('casecraft-design', JSON.stringify(serialize())); $('#modalTitle').innerHTML='A piece of <em>your own.</em>'; $('.modal-footnote').textContent='Complete the customer details below to download a quotation or prepare an order inquiry.'; } catch(e) { $('.modal-footnote').textContent='Copy or share your design to keep this configuration. This demo does not submit a real order.'; }
  $('#modalSummary').textContent=summaryText();$('#quoteModal').hidden=false;document.body.style.overflow='hidden';
}
function closeModal(){ $('#quoteModal').hidden=true;document.body.style.overflow=''; }
function shareConfiguration(){
  const data=serialize();
  const url=new URL(window.location.href);
  url.hash='design='+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
  if(navigator.share){navigator.share({title:'My CaseCraft suitcase',text:summaryText(),url:url.href}).catch(()=>{});}
  else {navigator.clipboard?.writeText(url.href).then(()=>showToast('Shareable design link copied.')).catch(()=>showToast('Use Copy design details to save your configuration.'))||showToast('Share link ready in the address bar.');}
}
function loadFromHash(){
  const raw=window.location.hash.match(/design=([^&]+)/);
  if(raw){try{const data=JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(raw[1])))));Object.assign(state,data);return;}catch(e){console.warn('Could not restore shared configuration',e);}}
  try { const saved=localStorage.getItem('casecraft-design'); if(saved) Object.assign(state,JSON.parse(saved)); } catch(e) { console.warn('Could not restore saved configuration',e); }
}
function addToCart(){const total=updatePrice();const item={configuration:serialize(),price:total,addedAt:new Date().toISOString()};try{const cart=JSON.parse(localStorage.getItem('casecraft-cart')||'[]');cart.push(item);localStorage.setItem('casecraft-cart',JSON.stringify(cart));}catch(e){}openCart();}
function openCart(){let cart=[];try{cart=JSON.parse(localStorage.getItem('casecraft-cart')||'[]');}catch(e){}$('#cartCount').textContent=cart.length;$('#cartContents').innerHTML=cart.length?cart.map((item,i)=>'<div class="cart-item"><strong>CaseCraft '+sizeConfig[item.configuration.size].name+' · '+palette[item.configuration.color].name+'</strong><small>'+ (item.configuration.finish==='matte'?'Soft matte':'High gloss')+' · '+item.configuration.hardware+' hardware · Monogram '+(item.configuration.showMonogram?item.configuration.monogram:'none')+'</small><span>Item '+(i+1)+' · ₹'+item.price.toLocaleString('en-IN')+'</span></div>').join(''):'<div class="cart-empty">Your bag is empty. Customize a suitcase to add your first design.</div>';$('#cartTotal').textContent='₹'+cart.reduce((sum,item)=>sum+item.price,0).toLocaleString('en-IN');$('#cartModal').hidden=false;document.body.style.overflow='hidden';}
function closeCart(){$('#cartModal').hidden=true;document.body.style.overflow='';}
function checkoutDemo(){let cart=[];try{cart=JSON.parse(localStorage.getItem('casecraft-cart')||'[]');}catch(e){}if(!cart.length){showToast('Add a design to your bag first.');return;}const total=cart.reduce((sum,item)=>sum+item.price,0);$('#confirmationSummary').textContent='Demo order reference: CC-DEMO-'+Date.now().toString().slice(-6)+'\nItems: '+cart.length+'\nEstimated total: ₹'+total.toLocaleString('en-IN')+'\nPayment: Not collected';try{localStorage.setItem('casecraft-last-demo-order',JSON.stringify({items:cart,total,createdAt:new Date().toISOString()}));localStorage.removeItem('casecraft-cart');}catch(e){}$('#cartModal').hidden=true;$('#cartCount').textContent='0';$('#confirmationModal').hidden=false;}
function checkDelivery(){const pin=$('#pincodeInput').value.trim();const msg=$('#deliveryMessage');if(!/^[1-9][0-9]{5}$/.test(pin)){msg.textContent='Enter a valid 6-digit Indian pincode.';msg.style.color='#a34c3d';return;}const days=3+(Number(pin.slice(-1))%4);const date=new Date();date.setDate(date.getDate()+days);msg.style.color='#4c7356';msg.textContent='Demo estimate: delivery around '+date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+'. Availability is not live-verified.';}
function bindUI(){
  $('#colorSwatches').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(!b)return;state.color=b.dataset.color;updateMaterials();});
  $('#finishOptions').addEventListener('click',e=>{const b=e.target.closest('[data-finish]');if(!b)return;state.finish=b.dataset.finish;updateMaterials();updatePrice();});
  $('#hardwareOptions').addEventListener('click',e=>{const b=e.target.closest('[data-hardware]');if(!b)return;state.hardware=b.dataset.hardware;updateMaterials();updatePrice();});
  $('#sizeOptions').addEventListener('click',e=>{const b=e.target.closest('[data-size]');if(!b)return;state.size=b.dataset.size;applyScale();updatePrice();});
  $('#monogramInput').addEventListener('input',e=>{state.monogram=e.target.value.toUpperCase().slice(0,3);e.target.value=state.monogram;updateMonogram();if(tagGroup?.userData.tagMark){const old=tagGroup.userData.tagMark.material.map;tagGroup.userData.tagMark.material.map=makeMonogramTexture(state.monogram);tagGroup.userData.tagMark.material.needsUpdate=true;if(old)old.dispose();}});
  $('#monogramToggle').addEventListener('change',e=>{state.showMonogram=e.target.checked;updateMonogram();});
  $('#tagToggle').addEventListener('change',e=>{state.tag=e.target.checked;if(tagGroup)tagGroup.visible=state.tag;updatePrice();});
  $('#viewSwitcher').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);});
  document.querySelectorAll('.view-thumb').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('#resetView').addEventListener('click',()=>setView('threequarter'));
  $('#quoteButton').addEventListener('click',addToCart);
  $('#saveDesign').addEventListener('click',()=>{try{localStorage.setItem('casecraft-design',JSON.stringify(serialize()));showToast('Design saved in this browser.');}catch(e){showToast('Could not save in this browser.');}});
  $('#shareSecondary').addEventListener('click',shareConfiguration);
  $('#cartOpen').addEventListener('click',openCart);
  $('#closeCart').addEventListener('click',closeCart);
  $('#continueShopping').addEventListener('click',closeCart);
  $('#checkoutButton').addEventListener('click',checkoutDemo);
  $('#closeConfirmation').addEventListener('click',()=>{$('#confirmationModal').hidden=true;document.body.style.overflow='';});
  $('#finishCheckout').addEventListener('click',()=>{$('#confirmationModal').hidden=true;document.body.style.overflow='';});
  $('#cartModal').addEventListener('click',e=>{if(e.target===$('#cartModal'))closeCart();});
  $('#sizeGuideOpen').addEventListener('click',e=>{e.preventDefault();$('#sizeGuideModal').hidden=false;document.body.style.overflow='hidden';});
  $('#sizeGuideLink').addEventListener('click',e=>{e.preventDefault();$('#sizeGuideModal').hidden=false;document.body.style.overflow='hidden';});
  $('#closeSizeGuide').addEventListener('click',()=>{$('#sizeGuideModal').hidden=true;document.body.style.overflow='';});
  $('#checkPincode').addEventListener('click',checkDelivery);
  $('#newsletterForm').addEventListener('submit',e=>{e.preventDefault();const email=$('#newsletterEmail').value.trim();if(!email)return;try{const list=JSON.parse(localStorage.getItem('casecraft-newsletter')||'[]');if(!list.includes(email))list.push(email);localStorage.setItem('casecraft-newsletter',JSON.stringify(list));}catch(e){}$('#newsletterForm').reset();showToast('You’re on the demo list. Thanks for joining.');});
  $('#closeModal').addEventListener('click',closeModal);
  $('#quoteModal').addEventListener('click',e=>{if(e.target===$('#quoteModal'))closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeCart();$('#sizeGuideModal').hidden=true;$('#confirmationModal').hidden=true;document.body.style.overflow='';}});
  $('#copyDesign').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(summaryText());showToast('Configuration details copied.');}catch(e){const ta=document.createElement('textarea');ta.value=summaryText();document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('Configuration details copied.');}});
  $('#downloadQuote').addEventListener('click',window.downloadQuote);
  $('#quoteForm').addEventListener('submit',window.submitInquiry);
  $('#headerShare').addEventListener('click',shareConfiguration);
}
loadFromHash();
try{init3D();}catch(err){console.error('3D viewer could not start:',err);$('#loadingScene').innerHTML='<span>3D preview unavailable in this browser. Try a WebGL-enabled browser.</span>';}
bindUI();$('#monogramInput').value=state.monogram;$('#monogramToggle').checked=state.showMonogram;$('#tagToggle').checked=state.tag;updateMaterials();updatePrice();updateMonogram();try{$('#cartCount').textContent=JSON.parse(localStorage.getItem('casecraft-cart')||'[]').length;}catch(e){$('#cartCount').textContent='0';}
window.CaseCraft={getState:serialize,getSummary:summaryText,getCustomerHardware:()=>$('#selectedHardwareName').textContent,getPrice:()=>$('#totalPrice').textContent,getColor:()=>palette[state.color].name,getSize:()=>sizeConfig[state.size].name,getDimensions:()=>sizeConfig[state.size].dimensions};