function e(e,t){for(let n of t)if(e.endsWith(n))return n;return null}function t(e){return/(ci|ce)$/.test(e)?e.slice(0,-2)+`k`:/(zi|ze)$/.test(e)?e.slice(0,-2)+`h`:/(cte|cti)$/.test(e)?e.slice(0,-3)+`ck`:/(ste|sti)$/.test(e)?e.slice(0,-3)+`sk`:e.slice(0,-1)}var n=[`ech`,`ich`,`eho`,`emi`,`emu`,`ete`,`eti`,`iho`,`imi`,`imu`],r=[`ach`,`ata`,`aty`,`ych`,`ama`,`ami`,`ove`,`ovi`,`ymi`],i=[`es`,`em`,`im`],a=[`um`,`at`,`am`,`os`,`us`,`ym`,`mi`,`ou`];function o(o){let s=o.length;if(s>7&&o.endsWith(`atech`))return o.slice(0,-5);if(s>6){if(o.endsWith(`etem`))return t(o.slice(0,-3));if(o.endsWith(`atum`))return o.slice(0,-4)}if(s>5){if(e(o,n))return t(o.slice(0,-2));if(e(o,r))return o.slice(0,-3)}if(s>4){if(e(o,i))return o.endsWith(`em`)?t(o.slice(0,-1)):t(o.slice(0,-2));if(e(o,a))return o.slice(0,-2)}if(s>3){let e=o[s-1];if(e===`e`||e===`i`)return t(o);if(`uyao`.includes(e))return o.slice(0,-1)}return o}function s(e){let n=e.length;if(n>4){if(e.endsWith(`ov`)||e.endsWith(`uv`))return e.slice(0,-2);if(n>5&&e.endsWith(`in`))return t(e.slice(0,-1))}return e}function c(e){if(!e||e.length<4)return e;let t=o(e);if(t.length<3)return e;let n=s(t);return n.length>=3&&(t=n),t.length>3&&/[aeiouy]$/.test(t)&&(t=t.slice(0,-1)),t}var l=new Set(`
a aby ac aj ale anebo ani aniz ano asi az ba bez bude budem budes budeme budete
budou by byl byla byli bylo byly byt bych bychom byste ci cim co coz da
 dalsi de do dnes dokud dost 
ho i ja jak jake jaky jakych jakoz je jeho jej jeji jejich jejichz jemu jen
jenz jeste jeste jesti jestli jestlize ji jich jim jimi jine jiny jiz
jsem jses jsi jsme jsou jsouc jsouci jsouce jste k kam kde kdo kdy kdyby
kdyz ke kolik kterou ktery ktera ktere kteri kterych kterym kterymi ku ma
maji mam mame mate me mezi mi mit mne mnou mohl mohou moje moji muj
muze my na nad nam nami nas nase nasi ne nebo nebot nebyl nebyla nebyli
nebyly nechce nechci nechte nej nejsi nejsou nejste nemaji nemame nemate
nemel neni nestaci nez ni nic nich nim nimi o od ode on ona
one oni ono ony pak po pod podle pokud potom pouze pred pres pri pro
proc proto protoze proti prvni s se sem si sice sve
svych svym svymi svuj ta tady tak take takze tam tamhle tamhleto tamto te
tebe tebou ted tedy tehle tehleto tehleto ten tenhle tento teto ti tim
timto to tobe tohle tohleto toho tohoto tom tomto tomu tomuto toto tu
tudiz tuto tvoje tvuj ty tyto u uz v vam vami vas vase vasi ve 
 vsak vsechen vsechno vsichni vy vzdy z za zda zde ze zpet 
 
a an and are as at be been but by for from has have he her his if in into is
it its of on or that the their them then there these they this to was were
will with you your not no so than too very can could would should do does
did also
`.split(/\s+/).filter(Boolean)),u=null,d=0;function f(e){u=e&&e.size?e:null,d++}function p(){return d}function m(e){return u?u.get(e):void 0}function h(e){let t=new Map;if(!e)return t;for(let n of e.split(`
`)){let e=n.indexOf(`	`);if(e<0)continue;let r=n.slice(0,e);for(let i of n.slice(e+1).split(`,`))i&&t.set(i,r)}return t}var g=/[\p{L}\p{N}\p{M}]+(?:-[\p{L}\p{N}\p{M}]+)*/gu;function _(e){return e.some(e=>e.length<=2||/\p{N}/u.test(e))}var v=/(?<=\p{Ll})(?=\p{Lu})/u;function y(e){return(e||``).normalize(`NFKD`).replace(/\p{M}+/gu,``).toLowerCase()}function b(e,{mode:t=`index`}={}){let n=[];if(!e)return n;g.lastIndex=0;let r;for(;(r=g.exec(e))!==null;){let e=r[0],i=r.index;if(!e.includes(`-`)){let r=y(e);if(r&&n.push({raw:e,token:r,start:i,end:i+e.length}),t===`index`&&v.test(e)){let t=i;for(let r of e.split(v))r.length>=2&&n.push({raw:r,token:y(r),start:t,end:t+r.length}),t+=r.length}continue}let a=e.split(`-`),o=a.map(y);if(_(o)&&(n.push({raw:e,token:o.join(``),start:i,end:i+e.length}),t===`query`))continue;let s=i;for(let e=0;e<a.length;e++)o[e]&&n.push({raw:a[e],token:o[e],start:s,end:s+a[e].length}),s+=a[e].length+1}return n}function x(e,t){return b(e,t).map(e=>e.token)}function S(e){return/^[a-z]+$/.test(e)?m(e)??c(e):e}function C(e,{stop:t=!0}={}){let n=[];for(let r of x(e))t&&l.has(r)||n.push(S(r));return n}function w(e){let t=e||``,n=x(t,{mode:`query`});if(n.length===0)return{stems:[],prefix:``,tokens:n};let r=!/[\s"]$/.test(t),i=n,a=``;r&&n[n.length-1].length>=2&&!/^\p{N}+$/u.test(n[n.length-1])&&(a=n[n.length-1],i=n.slice(0,-1));let o=i.filter(e=>!l.has(e));o.length===0&&!a&&(o=i);let s={};for(let e of o)s[S(e)]??=e;let c=Object.keys(s);return a&&l.has(a)&&c.length>0&&(a=``),{stems:c,prefix:a,tokens:n,words:s}}export{x as a,p as c,l as d,S as i,h as l,w as n,b as o,y as r,m as s,C as t,f as u};