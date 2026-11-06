function e(e,t,n){let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS)){let t=e.getShaderInfoLog(r);throw e.deleteShader(r),Error(`Shader se nepřeložil: ${t}`)}return r}function t(t,n,r){let i=t.createProgram(),a=null,o=null;try{if(a=e(t,t.VERTEX_SHADER,n),o=e(t,t.FRAGMENT_SHADER,r),t.attachShader(i,a),t.attachShader(i,o),t.linkProgram(i),!t.getProgramParameter(i,t.LINK_STATUS))throw Error(`Program se nesestavil: ${t.getProgramInfoLog(i)}`);return i}catch(e){throw t.deleteProgram(i),e}finally{a&&t.deleteShader(a),o&&t.deleteShader(o)}}async function n(e){let t=await fetch(e);if(!t.ok)throw Error(`Nepodařilo se načíst ${e}`);return createImageBitmap(await t.blob(),{premultiplyAlpha:`premultiply`,colorSpaceConversion:`none`})}async function r(e){let t=await fetch(e);if(!t.ok)throw Error(`Nepodařilo se načíst ${e}`);return createImageBitmap(await t.blob(),{premultiplyAlpha:`none`,colorSpaceConversion:`none`})}function i(e,t){let n=()=>{e.isConnected||t.getExtension(`WEBGL_lose_context`)?.loseContext()};typeof requestAnimationFrame==`function`?requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(n,100))):setTimeout(n,100)}const a={dech:.011,vlasy:7,hlavaKyv:.009,pohledPosun:5,oci:[7.5,3.5],pohledNaklon:.028,vyklonMeritko:.06,vyklonVyska:6,motyl:.32},o=[225,330],s=[234,440],c=[352,178],l=(()=>{let e=Math.hypot(70,-165);return[70/e,-165/e]})(),u=[`napul`,`napul`,`zavrene`,`zavrene`,`zavrene`,`zavrene`,`napul`,`napul`],d=.15,f=[...u,...[,,,].fill(null),...u];function p(e,t,n=t()<.16666666666666666){return{zacatek:e,dvojite:n,dalsi:e+3+4*t()}}function m(e=Math.random){let t=null,n=n=>{for(t===null&&(t=p(n+3+4*e(),e));n>=t.dalsi;)t=p(t.dalsi,e);if(n<t.zacatek)return null;let r=Math.floor((n-t.zacatek)*24);return(t.dvojite?f:u)[r]??null};return n.vynut=(r,i=!1)=>{n(r)===null&&(t=p(r,e,i))},n}function ee(e){return 2*Math.PI*Math.floor(e*12)/12/4}const h=.7;function te(e=Math.random){let t=null,n=t=>t+7+8*e(),r=e=>{for(t===null&&(t=n(e));e>=t+.7&&e>=t;)t=n(t+h);if(e<t)return 0;let r=Math.floor((e-t)*24)/24;return Math.sin(Math.PI*r/(h/2))**2};return r.vynut=e=>{r(e)>0||(t=e)},r}const g=[`pobaveni`,`uskleb`,`prekvapeni`],_=[25,50],ne=[2,3],v=.12;function re(e=Math.random){let t=t=>t[0]+(t[1]-t[0])*e(),n=t=>t[Math.min(t.length-1,Math.floor(e()*t.length))],r=null,i=null,a=(e,n)=>{i={vyraz:n,od:e,do:e+t(ne)},r=i.do+t(_)},o=(o,s=o,c=!0)=>{if(r===null&&(r=o+t(_)),i&&o>=i.do&&(i=null),!i&&o>=r){if(!c)return{vyraz:null,sila:0};let t=o-s>=4;a(o,t&&e()<.6?`zamysleni`:n([`pobaveni`,`uskleb`,`zamysleni`]))}if(!i)return{vyraz:null,sila:0};let l=Math.min(1,(o-i.od)/v,(i.do-o)/v);return{vyraz:i.vyraz,sila:Math.max(0,l)}};return o.vynut=(e,t=null)=>{let r=i?.vyraz;a(e,t||n(g.filter(e=>e!==r)))},o}const y=[5,10],b=[.9,1.8];function x(e=Math.random){let t=null,n=-1,r=null,i=t=>t[0]+(t[1]-t[0])*e();return(a,o)=>{if(a-o<y[0])return t=null,r=null,null;if(t===null&&(t=o+i(y)),r&&a<n)return r;if(r=null,a>=t){let o=e()*Math.PI*2;return r=[Math.cos(o)*.9,Math.sin(o)*.6],n=a+i(b),t=n+i(y),r}return null}}function ie(e,t,n,r,i){let a=Math.max(1,Math.ceil(i/(1/120))),o=i/a,[s,c]=e;for(let e=0;e<a;e++)c+=(n*(t-s)-r*c)*o,s+=c*o;return[s,c]}function ae(e,t){let n=t=>{let n=Math.sin((e+1)*12.9898+t*78.233)*43758.5453;return n-Math.floor(n)},r=.35+.65*n(1),i=5+9*r,a=508-(n(2)*548+t*i)%548,o=n(3)*468+Math.sin(t*(.3+.4*n(4))+n(5)*6.28)*12,s=(.35+.65*(.5+.5*Math.sin(t*(.8+n(6))+n(7)*6.28)))*(.1+.16*r);return[o,a,1.6+3.4*r,s,r]}const S=e=>typeof requestAnimationFrame==`function`?requestAnimationFrame(e):setTimeout(()=>e(performance.now()),16),C=e=>typeof cancelAnimationFrame==`function`?cancelAnimationFrame(e):clearTimeout(e),w=`
const float OBR = ${468 .toFixed(1)};
const float OKRAJ = ${0 .toFixed(3)};
vec4 doKlipu(vec2 p) {
  vec2 c = (p + OKRAJ) / (OBR + 2.0 * OKRAJ);
  return vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0);
}`,oe=`#version 300 es
precision highp float;
in vec2 a_uv;
uniform sampler2D u_vahy;
uniform vec2 u_vlasy;      // posun pramenů vlevo a vpravo
uniform float u_dech;      // měřítko výšky (1 = klid)
uniform vec3 u_hlava;      // náklon, posun x, posun y
uniform float u_motyl;     // přivření křídel 0..1
uniform float u_vyklon;    // přiblížení k oknu 0..1
uniform vec2 u_oci;        // posun duhovek
out vec2 v_uv;
out vec2 v_pos;
${w}
void main() {
  vec2 p = a_uv * OBR;
  vec4 w = textureLod(u_vahy, a_uv, 0.0);
  // Duhovky za kurzorem (váha je uvnitř oka, řasy a koutky stojí).
  p += w.a * u_oci;
  // Křídla motýla se přivírají k úchytu kolmo na osu křídel.
  vec2 q = p - vec2(${c[0].toFixed(1)}, ${c[1].toFixed(1)});
  vec2 d = vec2(${l[0].toFixed(5)}, ${l[1].toFixed(5)});
  vec2 kolmo = q - dot(q, d) * d;
  p -= w.b * u_motyl * ${a.motyl.toFixed(3)} * kolmo;
  // Prameny vlasů: levá a pravá strana s jinou fází.
  p.x += w.g * mix(u_vlasy.x, u_vlasy.y, step(0.5, a_uv.x));
  // Hlava: otočení kolem krku a posun za pohledem.
  vec2 o = vec2(${o[0].toFixed(1)}, ${o[1].toFixed(1)});
  vec2 r = p - o;
  float s = sin(u_hlava.x);
  float c = cos(u_hlava.x);
  vec2 otocene = vec2(c * r.x - s * r.y, s * r.x + c * r.y) + o;
  p += w.r * (otocene - p + u_hlava.yz);
  // Dech od spodní hrany.
  p.y = OBR - (OBR - p.y) * u_dech;
  // Přiblížení k oknu: zvětšení k divákovi a kousek nahoru.
  vec2 v = vec2(${s[0].toFixed(1)}, ${s[1].toFixed(1)});
  p = v + (p - v) * (1.0 + ${a.vyklonMeritko.toFixed(3)} * u_vyklon) - vec2(0.0, ${a.vyklonVyska.toFixed(1)} * u_vyklon);
  gl_Position = doKlipu(p);
  v_uv = a_uv;
  v_pos = p;
}`,se=`#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_pos;
uniform sampler2D u_tex;
uniform float u_aa;
uniform float u_alfa;      // průhlednost vrstvy (prolnutí výrazu)
out vec4 outColor;
void main() {
  float r = length(v_pos - vec2(${234 .toFixed(1)}));
  float kruh = 1.0 - smoothstep(${234 .toFixed(1)} - u_aa, ${234 .toFixed(1)}, r);
  outColor = texture(u_tex, v_uv) * kruh * u_alfa;
}`,T=`#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_pos;
${w}
void main() {
  v_pos = a_pos;
  gl_Position = doKlipu(a_pos);
}`,ce=`#version 300 es
precision highp float;
in vec2 v_pos;
uniform vec2 u_svetlo;
uniform float u_jas;
uniform vec4 u_castice[7];
uniform float u_aa;
out vec4 outColor;
void main() {
  float r = length(v_pos - vec2(${234 .toFixed(1)}));
  float kruh = 1.0 - smoothstep(${234 .toFixed(1)} - u_aa, ${234 .toFixed(1)}, r);
  vec3 barva = vec3(58.0 / 255.0);
  vec2 ds = v_pos - u_svetlo;
  barva += vec3(0.86, 0.82, 0.98) * u_jas * exp(-dot(ds, ds) / (2.0 * 150.0 * 150.0));
  for (int i = 0; i < 7; i++) {
    vec4 k = u_castice[i];
    float d = length(v_pos - k.xy);
    barva += vec3(0.88, 0.95, 0.90) * k.w * (1.0 - smoothstep(k.z * 0.4, k.z, d));
  }
  outColor = vec4(barva * kruh, kruh);
}`;function E(e,o){let{urlPostavy:s,urlVah:c,oci:l=null,vyrazy:u=null,nahoda:p=Math.random,naZtratu:h=null,naChybu:_=null,naPrvniSnimek:ne=null}=o,v=e.getContext(`webgl2`,{alpha:!0,premultipliedAlpha:!0,antialias:!1});if(!v)throw Error(`WebGL2 není k dispozici`);let y=t(v,oe,se),b;try{b=t(v,T,ce)}catch(e){throw v.deleteProgram(y),e}let w=[],E=/* @__PURE__ */ new Float32Array(18818);for(let e=0;e<97;e++)for(let t=0;t<97;t++)E[(e*97+t)*2]=t/96,E[(e*97+t)*2+1]=e/96;let D=/* @__PURE__ */ new Uint16Array(55296),O=0;for(let e=0;e<96;e++)for(let t=0;t<96;t++){let n=e*97+t;D.set([n,n+97,n+1,n+1,n+97,n+97+1],O),O+=6}let k=v.createVertexArray();v.bindVertexArray(k);let le=v.createBuffer(),ue=v.createBuffer();w.push(le,ue),v.bindBuffer(v.ARRAY_BUFFER,le),v.bufferData(v.ARRAY_BUFFER,E,v.STATIC_DRAW);let de=v.getAttribLocation(y,`a_uv`);v.enableVertexAttribArray(de),v.vertexAttribPointer(de,2,v.FLOAT,!1,0,0),v.bindBuffer(v.ELEMENT_ARRAY_BUFFER,ue),v.bufferData(v.ELEMENT_ARRAY_BUFFER,D,v.STATIC_DRAW);let A=v.createVertexArray();v.bindVertexArray(A);let fe=v.createBuffer();w.push(fe),v.bindBuffer(v.ARRAY_BUFFER,fe),v.bufferData(v.ARRAY_BUFFER,new Float32Array([-0,-0,468,-0,-0,468,-0,468,468,-0,468,468]),v.STATIC_DRAW);let pe=v.getAttribLocation(b,`a_pos`);v.enableVertexAttribArray(pe),v.vertexAttribPointer(pe,2,v.FLOAT,!1,0,0),v.bindVertexArray(null);let j={};for(let e of[`u_vahy`,`u_vlasy`,`u_dech`,`u_hlava`,`u_motyl`,`u_vyklon`,`u_oci`,`u_tex`,`u_aa`,`u_alfa`])j[e]=v.getUniformLocation(y,e);let M={};for(let e of[`u_svetlo`,`u_jas`,`u_castice`,`u_aa`])M[e]=v.getUniformLocation(b,e);v.useProgram(y),v.uniform1i(j.u_tex,0),v.uniform1i(j.u_vahy,1),v.enable(v.BLEND),v.blendFunc(v.ONE,v.ONE_MINUS_SRC_ALPHA),v.clearColor(0,0,0,0);let N=!1,me=!1,P=!0,he=/* @__PURE__ */ new Map;function ge(e,t){let n=v.createTexture();return v.activeTexture(t?v.TEXTURE1:v.TEXTURE0),v.bindTexture(v.TEXTURE_2D,n),v.texImage2D(v.TEXTURE_2D,0,v.RGBA,v.RGBA,v.UNSIGNED_BYTE,e),v.texParameteri(v.TEXTURE_2D,v.TEXTURE_WRAP_S,v.CLAMP_TO_EDGE),v.texParameteri(v.TEXTURE_2D,v.TEXTURE_WRAP_T,v.CLAMP_TO_EDGE),v.texParameteri(v.TEXTURE_2D,v.TEXTURE_MAG_FILTER,v.LINEAR),t?v.texParameteri(v.TEXTURE_2D,v.TEXTURE_MIN_FILTER,v.LINEAR):(v.generateMipmap(v.TEXTURE_2D),v.texParameteri(v.TEXTURE_2D,v.TEXTURE_MIN_FILTER,v.LINEAR_MIPMAP_LINEAR)),v.activeTexture(v.TEXTURE0),n}function F(e,t,i){if(!e)return null;let a={tex:null,hotovo:!1};return he.set(e,a),(t?r(e):n(e)).then(e=>{N||v.isContextLost()||(a.tex=ge(e,t),a.hotovo=!0,e.close&&e.close(),P=!0)}).catch(()=>{N||!i||me||(me=!0,_&&_())}),a}let _e=F(s,!1,!0),ve=F(c,!0,!0),I=null,L=null,R={},ye=m(p),be=te(p),xe=x(p),z=re(p),B=0,V=[0,0],H=/* @__PURE__ */ new Set,U=0,W=null,Se=``,Ce=!1,G=0,K=0,we=!1,Te=-1,q=0,J=[0,0],Y=[0,0],X=[0,0],Z=[0,0];function Ee(e,t){J[0]=e,J[1]=t,B=U,$()}function De(e){we=!!e,$()}function Oe(){Te=U+.9,$(),be.vynut(U);let e=g.every(e=>R[e]?.hotovo);if(e&&q>0){z.vynut(U);return}ye.vynut(U+d,!0),e&&z.vynut(U+d+f.length/24)}function Q(e){C(G),clearTimeout(K),G=0,K=0,!(N||H.size>0)&&(e>0?K=setTimeout(()=>{K=0,G=S(je)},e):G=S(je))}function $(){K&&Q(0)}function ke(e,t){let n=H.size>0;t?H.add(e):H.delete(e),H.size>0?(W=null,Q(0)):n&&Q(0)}function Ae(t){let n=1-Math.exp(-t*4.5);Y[0]+=(J[0]-Y[0])*n,Y[1]+=(J[1]-Y[1])*n;let r=we||U<Te?1:0;X=ie(X,r,130,17,t);let i=xe(U,B)||Y,o=1-Math.exp(-t*14);V[0]+=(i[0]-V[0])*o,V[1]+=(i[1]-V[1])*o;let s=Y[0]*a.pohledPosun;Z=ie(Z,s,38,5,t);let c=Z[0]-s,d=l?ye(U):null,f=u?z(U,B,d===null):{vyraz:null,sila:0},p=f.vyraz&&R[f.vyraz]?.hotovo?R[f.vyraz]:null;q=p?f.sila:0;let m=q>0?null:d,h=be(U),te=Math.floor(U*12),g=!m&&h===0&&(q===0||q===1)&&U>=Te&&Math.max(Math.abs(J[0]-Y[0]),Math.abs(J[1]-Y[1]),Math.abs(i[0]-V[0]),Math.abs(i[1]-V[1]),Math.abs(r-X[0]))<.003&&Math.abs(X[1])<.01&&Math.abs(c)<.05&&Math.abs(Z[1])<.05,_=[Y[0],Y[1],V[0],V[1],X[0],c].map(e=>Math.round(e*400)).join(`,`),re=[te,m,h.toFixed(3),_,e.width,I?.hotovo,L?.hotovo,p?f.vyraz:``,Math.round(q*60)].join(`|`);if(!P&&re===Se)return g;if(P=!1,Se=re,v.viewport(0,0,v.drawingBufferWidth,v.drawingBufferHeight),v.clear(v.COLOR_BUFFER_BIT),!_e.hotovo||!ve.hotovo)return!1;let x=te/12,S=ee(U),C=468/Math.max(1,e.width)*1.2;v.useProgram(b),v.bindVertexArray(A),v.uniform1f(M.u_aa,C),v.uniform2f(M.u_svetlo,150-Y[0]*26,110-Y[1]*20),v.uniform1f(M.u_jas,.07+.04*X[0]);let w=/* @__PURE__ */ new Float32Array(28);for(let e=0;e<7;e++){let[t,n,r,i,a]=ae(e,x);w.set([t-Y[0]*14*a,n-Y[1]*10*a,r,i],e*4)}v.uniform4fv(M.u_castice,w),v.drawArrays(v.TRIANGLES,0,6),v.useProgram(y),v.bindVertexArray(k),v.uniform1f(j.u_aa,C),v.uniform2f(j.u_vlasy,a.vlasy*Math.sin(S)-c,-a.vlasy*Math.cos(S)-c),v.uniform1f(j.u_dech,1+a.dech*Math.sin(S));let oe=a.hlavaKyv*Math.sin(2*Math.PI*x/8);v.uniform3f(j.u_hlava,oe+Y[0]*a.pohledNaklon,s,Y[1]*a.pohledPosun*.6),v.uniform1f(j.u_motyl,h),v.uniform1f(j.u_vyklon,Math.max(0,X[0]));let se=1-q;v.uniform2f(j.u_oci,V[0]*a.oci[0]*se,V[1]*a.oci[1]*se),v.activeTexture(v.TEXTURE1),v.bindTexture(v.TEXTURE_2D,ve.tex),v.activeTexture(v.TEXTURE0);let T=[[_e,1]],ce=m===`napul`?I:m===`zavrene`?L:null;ce&&I?.hotovo&&L?.hotovo&&T.push([ce,1]),p&&T.push([p,q]);for(let[e,t]of T)v.uniform1f(j.u_alfa,t),v.bindTexture(v.TEXTURE_2D,e.tex),v.drawElements(v.TRIANGLES,D.length,v.UNSIGNED_SHORT,0);if(!Ce){if(Ce=!0,l&&(I=F(l.napul,!1,!1),L=F(l.zavrene,!1,!1)),u)for(let[e,t]of Object.entries(u))R[e]=F(t,!1,!1);ne&&ne()}return g}function je(e){if(G=0,H.size>0)return;let t=W===null?0:Math.min(.1,Math.max(0,(e-W)/1e3));U+=t,W=e,Q(Ae(t)?Math.max(1,((Math.floor(U*12)+1)/12-U)*1e3):0)}function Me(t,n){let r=Math.max(1,Math.round(t)),i=Math.max(1,Math.round(n));(e.width!==r||e.height!==i)&&(e.width=r,e.height=i,P=!0,H.size===0&&Ae(0))}let Ne=e=>{e.preventDefault(),h&&h()};e.addEventListener(`webglcontextlost`,Ne),Q(0);function Pe(){if(!N){if(N=!0,C(G),clearTimeout(K),e.removeEventListener(`webglcontextlost`,Ne),!v.isContextLost()){for(let e of he.values())e.tex&&v.deleteTexture(e.tex);for(let e of w)v.deleteBuffer(e);v.deleteVertexArray(k),v.deleteVertexArray(A),v.deleteProgram(y),v.deleteProgram(b)}he.clear(),`isConnected`in e&&i(e,v)}}return{nastavPohled:Ee,nastavNajeti:De,nastavVelikost:Me,pozastav:ke,reaguj:Oe,ukazVyraz:e=>z.vynut(U,e),znic:Pe}}const D=/* @__PURE__ */ new Set([`nastavPohled`,`nastavNajeti`,`nastavVelikost`,`pozastav`,`reaguj`,`ukazVyraz`]);let O=null;self.onmessage=e=>{let t=e.data;if(t.typ===`start`)try{O=E(t.canvas,{...t.volby,naPrvniSnimek:()=>self.postMessage({typ:`prvniSnimek`}),naChybu:()=>self.postMessage({typ:`chyba`,zprava:`nenačetla se postava nebo váhy`}),naZtratu:()=>self.postMessage({typ:`ztrata`})}),O.nastavVelikost(t.sirka,t.vyska)}catch(e){self.postMessage({typ:`chyba`,zprava:e?.message||String(e),start:!0})}else t.typ===`volej`?O&&D.has(t.metoda)&&O[t.metoda](...t.argumenty):t.typ===`znic`&&(O?.znic(),O=null,self.close())};