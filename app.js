const API='https://api.alquran.cloud/v1';
const sel=document.querySelector('#surah'),statusEl=document.querySelector('#status'),versesEl=document.querySelector('#verses');
let list=[],current=1,currentData=null,audioPlayer=null,activeUrl=null,selectedEdition='fr.hamidullah',continuous=false,playlistIndex=0;
const EDITIONS={fr:'fr.hamidullah',en:'en.sahih',es:'es.cortes',pt:'pt.elhayek'};
function msg(t){statusEl.textContent=t}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('coran-facile',3);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('surahs'))d.createObjectStore('surahs',{keyPath:'number'});if(!d.objectStoreNames.contains('metadata'))d.createObjectStore('metadata',{keyPath:'key'});if(!d.objectStoreNames.contains('audio'))d.createObjectStore('audio',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbAction(name,mode,fn){const d=await openDb();return new Promise((resolve,reject)=>{const tx=d.transaction(name,mode),r=fn(tx.objectStore(name));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function api(url){const r=await fetch(url);if(!r.ok)throw Error('network');const j=await r.json();if(j.code!==200)throw Error('api');return j.data}
async function saveSurah(data){try{await dbAction('surahs','readwrite',s=>s.put(data))}catch{}}
async function getSurah(n){try{return await dbAction('surahs','readonly',s=>s.get(Number(n)))}catch{return null}}
async function saveMeta(key,value){try{await dbAction('metadata','readwrite',s=>s.put({key,value}))}catch{}}
async function getMeta(key){try{return (await dbAction('metadata','readonly',s=>s.get(key)))?.value||null}catch{return null}}
async function saveTranslation(n,edition,texts){await saveMeta(`translation-${n}-${edition}`,texts)}
async function getTranslation(n,edition){return getMeta(`translation-${n}-${edition}`)}
async function getAudio(key){try{return await dbAction('audio','readonly',s=>s.get(key))}catch{return null}}
async function ensureLanguageSelector(){if(document.querySelector('#translation-language'))return;const wrap=document.createElement('div');wrap.className='language-picker';wrap.style.margin='12px 0';const label=document.createElement('label');label.htmlFor='translation-language';label.textContent='Langue de traduction : ';const select=document.createElement('select');select.id='translation-language';select.style.padding='8px';[['fr','Français'],['en','English'],['es','Español'],['pt','Português']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o)});select.value='fr';select.onchange=async()=>{selectedEdition=EDITIONS[select.value]||EDITIONS.fr;await openSurah(current)};wrap.append(label,select);const meta=document.querySelector('#meta');if(meta?.parentNode)meta.parentNode.insertBefore(wrap,meta.nextSibling);else versesEl.parentNode.insertBefore(wrap,versesEl)}
function fillList(items){list=items||[];sel.innerHTML='';list.forEach(s=>{const o=document.createElement('option');o.value=s.number;o.textContent=`${s.number}. ${s.englishName} — ${s.name}`;sel.append(o)})}
async function fetchSurah(n,edition){const [ar,tr]=await Promise.all([api(`${API}/surah/${n}/ar.alafasy`),api(`${API}/surah/${n}/${edition}`)]);const texts=tr.ayahs.map(a=>a.text||'');await saveTranslation(n,edition,texts);return {number:ar.number,name:ar.name,englishName:ar.englishName,translationName:ar.englishNameTranslation,count:ar.numberOfAyahs,type:ar.revelationType,ayahs:ar.ayahs.map((a,i)=>({num:a.numberInSurah,text:a.text,audio:a.audio||'',fr:edition==='fr.hamidullah'?texts[i]:'',translation:texts[i]||''})),translationEdition:edition}}
function btn(text,fn){const b=document.createElement('button');b.type='button';b.className='light';b.textContent=text;b.onclick=fn;return b}
async function playAyah(ayah){const saved=await getAudio(`${currentData.number}:${ayah.num}`);if(activeUrl)URL.revokeObjectURL(activeUrl);if(audioPlayer)audioPlayer.pause();if(saved?.blob){activeUrl=URL.createObjectURL(saved.blob);audioPlayer=new Audio(activeUrl);audioPlayer.play().catch(()=>{});msg('Lecture audio enregistrée hors connexion.');return}if(!navigator.onLine){msg('Cet audio n’est pas téléchargé. Reconnecte-toi puis appuie sur Télécharger cet audio.');return}audioPlayer=new Audio(ayah.audio);audioPlayer.play().catch(()=>msg('La lecture audio n’a pas pu démarrer.'));msg('Lecture audio en ligne.')}
function stopContinuous(){
  continuous=false;
  playlistIndex=0;
}

function playNextAyah(){
  if(!continuous||!currentData)return;

  if(playlistIndex>=currentData.ayahs.length){
    continuous=false;
    msg('Lecture de la sourate terminée.');
    return;
  }

  const ayah=currentData.ayahs[playlistIndex];
  const key=`${currentData.number}:${ayah.num}`;

  getAudio(key).then(saved=>{
    if(!continuous)return;

    if(saved?.blob){
      if(activeUrl)URL.revokeObjectURL(activeUrl);
      activeUrl=URL.createObjectURL(saved.blob);
      audioPlayer=new Audio(activeUrl);
    }else if(navigator.onLine&&ayah.audio){
      audioPlayer=new Audio(ayah.audio);
    }else{
      continuous=false;
      msg(`Audio du verset ${ayah.num} indisponible hors connexion.`);
      return;
    }

    audioPlayer.onended=()=>{
      if(continuous){
        playlistIndex++;
        playNextAyah();
      }
    };

    audioPlayer.onerror=()=>{
      continuous=false;
      msg(`Impossible de lire le verset ${ayah.num}.`);
    };

    audioPlayer.play().catch(()=>{
      continuous=false;
      msg('La lecture audio n’a pas pu démarrer.');
    });

    msg(`Lecture continue : verset ${ayah.num}/${currentData.ayahs.length}`);
  });
}

function startContinuous(){
  if(!currentData)return;
  if(audioPlayer)audioPlayer.pause();
  stopContinuous();
  continuous=true;
  playlistIndex=0;
  playNextAyah();
}

function pauseContinuous(){
  if(audioPlayer&&continuous){
    audioPlayer.pause();
    continuous=false;
    msg('Lecture mise en pause.');
  }
}

function resumeContinuous(){
  if(!currentData)return;

  if(audioPlayer&&audioPlayer.paused&&playlistIndex<currentData.ayahs.length){
    continuous=true;
    audioPlayer.play().catch(()=>{
      continuous=false;
      msg('La reprise audio a échoué.');
    });
    msg('Lecture reprise.');
  }else{
    startContinuous();
  }
}
async function downloadAyah(ayah,b){b.disabled=true;b.textContent='Téléchargement…';try{if(!navigator.onLine)throw Error('offline');const key=`${currentData.number}:${ayah.num}`;if((await getAudio(key))?.blob){b.textContent='Audio enregistré ✓';return}const r=await fetch(ayah.audio);if(!r.ok)throw Error('download');const blob=await r.blob();await dbAction('audio','readwrite',s=>s.put({key,blob}));b.textContent='Audio enregistré ✓';msg(`Audio du verset ${ayah.num} enregistré sur cet appareil.`)}catch{b.textContent='Télécharger cet audio';msg('Téléchargement impossible. Vérifie ta connexion Internet et réessaie.')}finally{b.disabled=false}}
async function render(data){current=data.number;currentData=data;await ensureLanguageSelector();const languageSelect=document.querySelector('#translation-language');languageSelect.value=Object.keys(EDITIONS).find(k=>EDITIONS[k]===selectedEdition)||'fr';sel.value=String(data.number);document.querySelector('#title').textContent=`${data.name} · ${data.englishName}`;document.querySelector('#meta').textContent=`Sourate ${data.number} · ${data.count} versets · ${data.type==='Meccan'?'Mecquoise':'Médinoise'}`;versesEl.replaceChildren();const cached=await getTranslation(data.number,selectedEdition);for(const ayah of data.ayahs){const article=document.createElement('article');article.className='verse';const ar=document.createElement('p');ar.className='arabic';ar.lang='ar';ar.dir='rtl';ar.textContent=ayah.text;const tr=document.createElement('p');tr.className='translation';const translation=cached?.[ayah.num-1]??(data.translationEdition===selectedEdition?ayah.translation:(selectedEdition==='fr.hamidullah'?ayah.fr:''));tr.textContent=`${ayah.num}. ${translation||'Traduction non enregistrée hors connexion.'}`;const actions=document.createElement('div');actions.className='verseactions';actions.append(btn('▶ Écouter',()=>playAyah(ayah)));const dl=btn('Télécharger cet audio',()=>downloadAyah(ayah,dl));if((await getAudio(`${data.number}:${ayah.num}`))?.blob)dl.textContent='Audio enregistré ✓';actions.append(dl);const tafsir=document.createElement('a');tafsir.textContent='Tafsir (Internet)';tafsir.href=`https://quran.com/${data.number}:${ayah.num}/tafsirs`;tafsir.target='_blank';tafsir.rel='noopener noreferrer';actions.append(tafsir);article.append(ar,tr,actions);versesEl.append(article)}}
async function openSurah(n){current=Math.max(1,Math.min(114,Number(n)||1));sel.value=String(current);msg('Chargement de la sourate et de la traduction…');try{const data=await fetchSurah(current,selectedEdition);await saveSurah(data);await render(data);msg('Sourate chargée. Les traductions choisies sont enregistrées localement après chargement.')}catch{const data=await getSurah(current);if(!data){msg('Cette sourate n’est pas enregistrée. Connecte-toi à Internet pour la charger.');return}await render(data);const tr=await getTranslation(current,selectedEdition);msg(tr||selectedEdition==='fr.hamidullah'?'Lecture hors connexion : le texte et la traduction disponible sont conservés sur cet appareil.':'Texte disponible hors connexion, mais cette traduction doit être chargée avec Internet une première fois.')}}
async function init(){await ensureLanguageSelector();try{const remote=await api(`${API}/surah`);fillList(remote);await saveMeta('surah-list',remote);await openSurah(1)}catch{const saved=await getMeta('surah-list');if(saved)fillList(saved);const first=await getSurah(1);if(first){await render(first);msg('Hors connexion : les sourates enregistrées sont disponibles.')}else msg('Première utilisation : connecte-toi à Internet pour charger les sourates.')}}
async function saveAllSurahs(){const b=document.querySelector('#save');b.disabled=true;let count=0;try{if(!list.length)fillList(await api(`${API}/surah`));await saveMeta('surah-list',list);for(let n=1;n<=114;n++){msg(`Enregistrement hors ligne : sourate ${n}/114…`);if(await getSurah(n)){count++;continue}const d=await fetchSurah(n,selectedEdition);await saveSurah(d);count++}msg(`Terminé : ${count}/114 sourates enregistrées. Pour chaque autre langue, ouvre les sourates avec Internet pour enregistrer sa traduction.`)}catch{msg(`Enregistrement interrompu après ${count} sourates. Reconnecte-toi puis réessaie.`)}finally{b.disabled=false}}
document.querySelector('#load').onclick=()=>openSurah(sel.value);sel.onchange=()=>openSurah(sel.value);document.querySelector('#prev').onclick=()=>openSurah(Math.max(1,current-1));document.querySelector('#next').onclick=()=>openSurah(Math.min(114,current+1));document.querySelector('#find').onclick=()=>{const q=document.querySelector('#search').value.trim().toLowerCase();const s=list.find(x=>String(x.number)===q||x.englishName.toLowerCase().includes(q)||x.englishNameTranslation.toLowerCase().includes(q)||x.name.includes(q));if(s)openSurah(s.number);else msg('Sourate introuvable. Essaie son nom ou son numéro.')};document.querySelector('#search').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#find').click()};document.querySelector('#save').textContent='Enregistrer les 114 sourates hors ligne';document.querySelector('#save').onclick=saveAllSurahs;if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));init();
