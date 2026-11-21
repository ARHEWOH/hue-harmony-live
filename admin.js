 'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const keys = ['segment','title','description','note','badge','tone'];
  let lastPublished = null;
  const presets = [
    ['Welcome', 'WELCOME TO', 'HUE & HARMONY', 'A celebration of every shade that makes us who we are.', 'The party is just getting started!', 'THE CELEBRATION', 'welcome'],
    ['The Whisper Challenge', 'GAME 01 · NOW PLAYING', 'THE WHISPER CHALLENGE', 'Teams try to lip-read messages while loud music plays through headphones.', '15 contestants — please come forward!', 'NOW HAPPENING', 'game'],
    ['Reverse Charades', 'GAME 02 · NOW PLAYING', 'REVERSE CHARADES', 'Four people act out the clue while one teammate tries to guess.', '15 contestants — report to the games arena!', 'NOW HAPPENING', 'game'],
    ['Dance Style Roulette', 'GAME 03 · NOW PLAYING', 'DANCE STYLE ROULETTE', 'The DJ switches genres without warning. Can the dancers keep up?', '15 dancers — take your positions!', 'NOW HAPPENING', 'game'],
    ['Find the Impostor', 'GAME 04 · NOW PLAYING', 'FIND THE IMPOSTOR', 'One contestant has a different secret word. Can the group expose them?', 'Keep your eyes on every answer!', 'NOW HAPPENING', 'game'],
    ['Minute to Win It', 'GAME 05 · NOW PLAYING', 'MINUTE TO WIN IT', 'Three teams race through rapid-fire mini challenges.', '15 contestants — come to the front!', 'NOW HAPPENING', 'game'],
    ['Wrong Answers Only', 'GAME 06 · NOW PLAYING', 'WRONG ANSWERS ONLY', 'The correct answer is the one thing you cannot say.', 'Can you answer without thinking?', 'NOW HAPPENING', 'game'],
    ['Finish the Lyrics', 'GAME 07 · NOW PLAYING', 'FINISH THE LYRICS', 'When the DJ stops the music, keep the song going!', 'Everybody else, sing along!', 'NOW HAPPENING', 'game'],
    ['Sell Me Nonsense', 'GAME 08 · NOW PLAYING', 'SELL ME NONSENSE', 'Teams pitch hilariously useless products as though they are life-changing.', 'Audience, you are the investors!', 'NOW HAPPENING', 'game'],
    ['Class Feud', 'GAME 09 · NOW PLAYING', 'CLASS FEUD', 'Teams battle to guess the most popular answers from classmates.', 'Cheer for your house!', 'NOW HAPPENING', 'game'],
    ['Nollywood in 60 Seconds', 'GAME 10 · NOW PLAYING', 'NOLLYWOOD IN 60 SECONDS', 'Create an entire dramatic Nollywood movie in one minute.', 'Actors, take the stage!', 'NOW HAPPENING', 'game'],
    ['Audience challenge', 'EVERYBODY JOINS IN', 'YOUR TURN!', 'It is time for a whole-class challenge.', 'Everyone, get ready!', 'AUDIENCE CHALLENGE', 'game'],
    ['Short break', 'TAKE FIVE', 'WE’LL BE RIGHT BACK', 'Enjoy the music, grab a refreshment, and stay close.', 'More fun is coming up next!', 'SHORT BREAK', 'break'],
    ['Announcement', 'ATTENTION PLEASE', 'QUICK ANNOUNCEMENT', 'We have an important update for everyone at Hue & Harmony.', 'Please listen to the MC.', 'ANNOUNCEMENT', 'notice'],
    ['Winner reveal', 'THE MOMENT OF TRUTH', 'AND THE WINNER IS…', 'A huge round of applause for our amazing contestants!', 'Make some noise!', 'WINNER REVEAL', 'award'],
    ['Closing', 'THANK YOU', 'YOU MADE THE MAGIC', 'Every shade. Every smile. One unforgettable celebration.', 'Hue & Harmony · All shades of us.', 'THAT’S A WRAP', 'welcome']
  ];
  function message(id, txt, kind='') { const el=$(id); el.textContent=txt; el.dataset.kind=kind; el.hidden=false; }
  function busy(btn, isBusy, text) { btn.disabled=isBusy; btn.textContent=isBusy ? 'Please wait…' : text; }
  function fill(scene) { keys.forEach(k=>{if(scene[k]!==undefined) $(k).value=scene[k];}); preview(); }
  function formScene(){const d={};keys.forEach(k=>d[k]=$(k).value.trim());return d;}
  function preview(){const d=formScene();for(const k of ['badge','segment','title','description','note'])$('pv-'+k).textContent=d[k]||'—';$('pv-note').hidden=!d.note;}
  for (const [i,p] of presets.entries()) {const o=document.createElement('option');o.value=String(i);o.textContent=p[0];$('preset').append(o);}
  $('preset').addEventListener('change',e=>{const p=presets[Number(e.target.value)];if(e.target.value!==''&&p)fill(Object.fromEntries(keys.map((k,i)=>[k,p[i+1]])));});
  for(const k of keys)$(k).addEventListener('input',preview);
  fill(Object.fromEntries(keys.map((k,i)=>[k,presets[0][i+1]])));
  async function api(path,options={}){
    const r=await fetch(path,{
      ...options, credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json',...options.headers}
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Request failed ('+r.status+')');
    return data;
  }
  function showEditor(yes){$('login-panel').hidden=yes;$('editor-panel').hidden=!yes;}
  async function checkEditor(){
    const result=await api('/api/me');
    showEditor(result.authenticated===true);
    if(result.authenticated)await loadCurrent();
  }
  async function loadCurrent(){
    $('live-status').textContent='Loading…';$('live-status').dataset.state='loading';
    try{
      const row=await api('/api/live');
      if(!row.title)throw new Error('Live activity missing');
      lastPublished=row;
      $('live-name').textContent=row.title;
      $('live-status').textContent='Published activity available';$('live-status').dataset.state='ok';
    }catch(e){$('live-name').textContent=e.message;$('live-status').textContent='Unable to load activity';$('live-status').dataset.state='error';}
  }
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();$('login-message').hidden=true;
    const btn=$('login-button');busy(btn,true,'Sign in');
    try{
      await api('/api/login',{method:'POST',body:JSON.stringify({email:$('login-email').value.trim(),password:$('login-password').value})});
      $('login-password').value='';
      await checkEditor();
    }catch(err){message('login-message',err.message,'error');}
    finally{busy(btn,false,'Sign in');}
  });
  $('publish-form').addEventListener('submit',async e=>{
    e.preventDefault();$('publish-message').hidden=true;
    const btn=$('publish-button');busy(btn,true,"✦ Publish to everyone's screen");
    try{
      const row=await api('/api/live',{method:'POST',body:JSON.stringify(formScene())});
      lastPublished=row;
      message('publish-message','Published! Everyone will see “'+row.title+'” after refreshing.','ok');
      await loadCurrent();
    }catch(err){message('publish-message',err.message,'error');}
    finally{busy(btn,false,"✦ Publish to everyone's screen");}
  });
  $('reload-live').addEventListener('click',loadCurrent);
  $('load-live').addEventListener('click',()=>{if(lastPublished)fill(lastPublished);});
  $('logout').addEventListener('click',async()=>{
    try{await api('/api/logout',{method:'POST',body:'{}'});}catch(_){}
    showEditor(false);$('login-message').hidden=true;
  });
  // Credentials never enter localStorage, sessionStorage, HTML, or GitHub.
  checkEditor().catch(()=>showEditor(false));
})();
