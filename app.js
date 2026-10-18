(function(){
'use strict';
var S = window.STUDY, M = S.meta;
var $ = function(sel, el){ return (el||document).querySelector(sel); };
var app = $('#app');

/* ---------- storage with in-memory fallback ---------- */
var mem = {};
var store = {
  ok: (function(){ try{ var k='__t'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return true; }catch(e){ return false; } })(),
  get: function(k, d){ try{ var v = this.ok ? localStorage.getItem('l137v_'+k) : mem[k]; return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set: function(k, v){ var s = JSON.stringify(v); try{ if(this.ok) localStorage.setItem('l137v_'+k, s); else mem[k]=s; }catch(e){ mem[k]=s; } }
};

/* ---------- helpers ---------- */
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function scrip(ref){ return S.scripture[ref]; }
function scripText(ref){ var s = scrip(ref); return s ? s.verses.map(function(v){ return v.t; }).join(' ') : ''; }
function scripHTML(ref, id){
  var s = scrip(ref); if(!s) return '';
  return '<div class="scrip"'+(id?' id="'+id+'"':'')+'><h3>'+esc(s.ref)+' (KJV)</h3>'+
    s.verses.map(function(v){ return '<p><sup>'+v.v+'</sup>'+esc(v.t)+'</p>'; }).join('')+'</div>';
}
function speakRef(ref){ var s = scrip(ref); return s ? s.ref.replace(/(\d+):(\d+)-(\d+)/,'chapter $1, verses $2 to $3').replace(/(\d+):(\d+)/,'chapter $1, verse $2') : ref; }
var CUE = {READ:'Read Scripture', PRAY:'Pray', REPEAT:'Repeat after me', FOLLOW:'Follow original direction', THANKS:'Give thanks'};
function chip(c){ return '<span class="chip '+c+'">'+CUE[c]+'</span>'; }
function bracketNote(t){ return esc(t).replace(/\[([^\]]+)\]/g,'<span class="br" title="Transcription unclear; suggested reading">[$1]</span>'); }
function sayable(t){ return t.replace(/\s*\[unclear\]\s*/g,' ').replace(/\s+,/g,',').replace(/[\[\]]/g,'').replace(/\s+/g,' ').trim(); }
function top(){ window.scrollTo(0,0); app.focus({preventScroll:true}); }
function setTitle(t){ $('#tbTitle').textContent = t; }

/* ---------- theme & font ---------- */
var theme = store.get('theme','day'), fs = store.get('fs',18);
function applyTheme(){ document.documentElement.setAttribute('data-theme', theme); $('#btnTheme').textContent = theme==='night' ? 'Day' : 'Night'; }
function applyFs(){ document.documentElement.style.setProperty('--fs', fs+'px'); }
applyTheme(); applyFs();
$('#btnTheme').onclick = function(){ theme = theme==='night' ? 'day' : 'night'; store.set('theme',theme); applyTheme(); };
$('#btnFontUp').onclick = function(){ fs = Math.min(28, fs+2); store.set('fs',fs); applyFs(); };
$('#btnFontDown').onclick = function(){ fs = Math.max(14, fs-2); store.set('fs',fs); applyFs(); };
$('#btnHome').onclick = function(){ go('home'); };

/* ---------- speech engine (Web Speech API) ---------- */
var synth = window.speechSynthesis || null;
var A = { q:[], i:0, playing:false, token:0, timer:null, onDone:null, label:'' };
var rateSel = $('#abRate'), autoBox = $('#abAuto'), repBox = $('#abRepeatMode');
rateSel.value = String(store.get('rate',1)); autoBox.checked = store.get('auto',true); repBox.checked = store.get('repmode',true);
rateSel.onchange = function(){ store.set('rate', parseFloat(rateSel.value)); if(A.playing){ playAt(A.i); } };
autoBox.onchange = function(){ store.set('auto', autoBox.checked); };
repBox.onchange = function(){ store.set('repmode', repBox.checked); if(current && current.rebuild) current.rebuild(); };
var voice = null;
function pickVoice(){
  if(!synth) return; var vs = synth.getVoices(); if(!vs.length) return;
  var pref = ['Samantha','Google US English','Microsoft Aria','Microsoft Jenny','Karen','Daniel','Moira','Google UK English Female'];
  for(var p=0;p<pref.length;p++){ for(var j=0;j<vs.length;j++){ if(vs[j].name.indexOf(pref[p])===0){ voice = vs[j]; return; } } }
  for(var k=0;k<vs.length;k++){ if(/^en[-_]/i.test(vs[k].lang)){ voice = vs[k]; return; } }
}
if(synth){ pickVoice(); if('onvoiceschanged' in synth) synth.onvoiceschanged = pickVoice; }
function status(t){ $('#abStatus').textContent = t; }
function splitText(t){
  var parts = t.match(/[^.!?;:]+[.!?;:]*["”']?\s*/g) || [t], out=[], buf='';
  parts.forEach(function(p){ if((buf+p).length < 220){ buf += p; } else { if(buf) out.push(buf.trim()); buf = p; } });
  if(buf.trim()) out.push(buf.trim());
  return out;
}
function clearHL(){ document.querySelectorAll('.now').forEach(function(e){ e.classList.remove('now'); }); }
function hl(id){ clearHL(); if(!id) return; var e = document.getElementById(id); if(e){ e.classList.add('now'); var r = e.getBoundingClientRect(); if(r.top < 70 || r.bottom > window.innerHeight-200) e.scrollIntoView({block:'center', behavior:'smooth'}); } }
function load(queue, onDone, label){ stopAudio(true); A.q = queue; A.i = 0; A.onDone = onDone || null; A.label = label || ''; status(label ? label+' · ready' : 'Ready'); }
function playAt(i){
  if(!A.q.length) return;
  if(synth) synth.cancel(); clearTimeout(A.timer);
  A.i = Math.max(0, Math.min(i, A.q.length-1)); A.playing = true; var tk = ++A.token; $('#abPlay').innerHTML = '❚❚<small>Pause</small>';
  var item = A.q[A.i];
  hl(item.el);
  function next(){ if(tk !== A.token) return; if(A.i < A.q.length-1){ playAt(A.i+1); } else { A.playing=false; $('#abPlay').innerHTML='▶<small>Play</small>'; status((A.label||'')+' · finished'); clearHL(); if(A.onDone) A.onDone(); } }
  status((A.label ? A.label+' · ' : '') + (item.pause ? 'Your turn: say it aloud' : 'Reading '+(A.i+1)+' of '+A.q.length));
  if(item.pause){
    var ms = item.pause / parseFloat(rateSel.value||1), bar = document.querySelector('.silence i');
    if(bar){ bar.style.transition='none'; bar.style.width='0'; void bar.offsetWidth; bar.style.transition='width '+ms+'ms linear'; bar.style.width='100%'; }
    A.timer = setTimeout(next, ms); return;
  }
  if(!synth){ status('Audio is not available in this browser. You can read along.'); A.playing=false; return; }
  var u = new SpeechSynthesisUtterance(item.text);
  if(voice) u.voice = voice; u.lang = (voice && voice.lang) || 'en-US'; u.rate = parseFloat(rateSel.value||1); u.pitch = 1;
  u.onend = next; u.onerror = function(e){ if(tk !== A.token) return; if(e && (e.error==='interrupted' || e.error==='canceled')) return; next(); };
  synth.speak(u);
}
function pauseAudio(){ A.token++; if(synth) synth.cancel(); clearTimeout(A.timer); A.playing=false; $('#abPlay').innerHTML='▶<small>Resume</small>'; status((A.label?A.label+' · ':'')+'Paused'); }
function stopAudio(silent){ A.token++; if(synth) synth.cancel(); clearTimeout(A.timer); A.playing=false; A.i=0; $('#abPlay').innerHTML='▶<small>Play</small>'; clearHL(); if(!silent) status((A.label?A.label+' · ':'')+'Stopped'); }
$('#abPlay').onclick = function(){ if(A.playing) pauseAudio(); else playAt(A.i); };
$('#abStop').onclick = function(){ stopAudio(); };
$('#abBack').onclick = function(){ playAt(A.i-1); };
$('#abFwd').onclick = function(){ playAt(A.i+1); };
$('#abRepeat').onclick = function(){ playAt(0); };
function showBar(on){ $('#audiobar').hidden = !on; document.body.classList.toggle('has-audio', !!on); }
function quickSpeak(texts, label){ var q=[]; texts.forEach(function(t){ splitText(t).forEach(function(c){ q.push({text:c}); }); }); load(q, null, label); showBar(true); playAt(0); }

/* ---------- guided experience: screens ---------- */
var SCREENS = [];
(function(){
  var dn = 0, dTotal = S.decl.length;
  S.sections.forEach(function(s, si){
    SCREENS.push({type:'sec', s:s, si:si});
    if(s.decl){ S.decl.forEach(function(d, di){ if(d.set === s.decl){ dn++; SCREENS.push({type:'decl', d:d, di:di, n:dn, total:dTotal, after:s}); } }); }
  });
})();
var current = null;

function secQueue(s){
  var q = [{text:'Part '+(S.sections.indexOf(s)+1)+'. '+s.title+'.', el:'ptitle'}];
  s.blocks.forEach(function(b, bi){ if(!b.who) return; splitText(b.t).forEach(function(c){ q.push({text:c, el:'b'+bi}); }); });
  s.refs.forEach(function(r, ri){
    q.push({text:'Scripture reading. '+scrip(r).ref.split(' ').slice(0,-1).join(' ')+' '+speakRef(r)+'.', el:'r'+ri});
    scrip(r).verses.forEach(function(v){ splitText(v.t).forEach(function(c){ q.push({text:c, el:'r'+ri}); }); });
  });
  return q;
}
function declQueue(d){
  var q = [], words = sayable(d.text).split(' ').length;
  if(repBox.checked){
    q.push({text:'Repeat after me.', el:'dq'});
    q.push({text:sayable(d.text), el:'dq'});
    q.push({pause: Math.max(3500, words*650), el:'dq'});
  } else { q.push({text:sayable(d.text), el:'dq'}); q.push({pause:1200, el:'dq'}); }
  return q;
}
function declHTML(d, n, total){
  var r = d.ref ? '<button class="reveal" id="refBtn">Show '+esc(scrip(d.ref).ref)+'</button><div id="refBox" hidden>'+scripHTML(d.ref)+'</div>' : '';
  return '<div class="decl">'+
    '<div class="dn">Declaration &amp; Prayer '+n+' of '+total+'</div>'+
    '<span class="kind '+d.type+'">'+(d.type==='Prayer'?'Pray':'Declare')+'</span>'+
    (repBox.checked ? '<div class="say">Repeat after me</div>' : '')+
    '<blockquote id="dq">'+bracketNote(d.text)+'</blockquote>'+
    '<div class="silence" aria-hidden="true"><i></i></div>'+
    '<div class="meta">Led by '+esc(d.who)+' · service time '+d.ts+'</div>'+ r +'</div>';
}
function bindRef(){ var b = $('#refBtn'); if(b) b.onclick = function(){ var x=$('#refBox'); x.hidden=!x.hidden; b.textContent = (x.hidden?'Show ':'Hide ')+b.textContent.replace(/^(Show|Hide) /,''); }; }

function guide(idx, autoplay){
  idx = Math.max(0, Math.min(idx, SCREENS.length-1));
  store.set('pos', idx);
  var sc = SCREENS[idx], pct = Math.round((idx+1)/SCREENS.length*100), h = '';
  setTitle('Guided prayer');
  h += '<div class="wrap"><div class="progress" aria-hidden="true"><i style="width:'+pct+'%"></i></div>';
  if(sc.type === 'sec'){
    var s = sc.s, ds = s.directions.map(function(i){ return S.directions[i]; });
    var cues = {}; ds.forEach(function(d){ cues[d.cue]=1; }); if(s.refs.length) cues.READ = 1;
    h += '<div class="count">Part '+(sc.si+1)+' of '+S.sections.length+' · Step '+(idx+1)+' of '+SCREENS.length+'</div>';
    h += '<h2 class="part-title" id="ptitle">'+esc(s.title)+'</h2>';
    h += '<div class="chips">'+Object.keys(cues).map(chip).join('')+'</div>';
    if(ds.length){ h += '<div class="box dir"><div class="label" style="margin-top:0">Original direction in this part</div>'+ds.map(function(d){ return '<div class="dir-item">'+chip(d.cue)+' “'+esc(d.text)+'”</div>'; }).join('')+'</div>'; }
    h += '<div class="label">Original prophetic direction · service time '+s.start+'</div><div class="tx">';
    s.blocks.forEach(function(b, bi){ h += '<div class="blk" id="b'+bi+'">'+(b.who?'<span class="who">'+esc(b.who)+' · '+b.ts+'</span>'+esc(b.t):'<span class="mark">'+esc(b.t)+'</span>')+'</div>'; });
    h += '</div>';
    if(s.refs.length){ h += '<div class="label">Read the Scripture (KJV)</div>'+s.refs.map(function(r, ri){ return scripHTML(r, 'r'+ri); }).join(''); }
  } else {
    h += '<div class="count">'+esc(sc.after.title)+' · Step '+(idx+1)+' of '+SCREENS.length+'</div>';
    h += declHTML(sc.d, sc.n, sc.total);
  }
  h += '<div class="navrow"><button id="gPrev"'+(idx===0?' disabled':'')+'>‹ Previous</button><button class="primary" id="gNext">'+(idx===SCREENS.length-1?'Finish':'Next ›')+'</button></div>';
  h += '<p class="note" style="text-align:center">Tap Play below to listen. Hands-free moves to the next step by itself.</p></div>';
  app.innerHTML = h; top(); bindRef(); showBar(true);
  var label = sc.type==='sec' ? 'Part '+(sc.si+1)+' of '+S.sections.length : 'Declaration '+sc.n+' of '+sc.total;
  function done(){ if(autoBox.checked){ if(idx < SCREENS.length-1) guide(idx+1, true); else go('complete'); } }
  var build = function(){ load(sc.type==='sec' ? secQueue(sc.s) : declQueue(sc.d), done, label); };
  build();
  current = {rebuild: function(){ if(sc.type==='decl'){ guide(idx, false); } }};
  $('#gPrev').onclick = function(){ guide(idx-1, A.playing); };
  $('#gNext').onclick = function(){ if(idx===SCREENS.length-1) go('complete'); else guide(idx+1, A.playing); };
  if(autoplay) playAt(0);
}

/* ---------- views ---------- */
function home(){
  setTitle('L137 Deliverance Ministry'); showBar(false); stopAudio(true); current=null;
  var pos = store.get('pos', 0), main = scrip(M.mainRef);
  var h = '<div class="wrap">'+
   '<section class="opening" aria-label="About this study"><div class="eyebrow">L137 Deliverance Ministry</div><p>'+esc(M.opening)+'</p><div class="rule"></div></section>'+
   '<section class="hero"><div class="ministry">'+esc(M.ministry)+'</div><h1>'+esc(M.title)+'</h1>'+
   '<div class="who">'+esc(M.minister)+'</div><div class="date">'+esc(M.date)+'</div>'+
   '<div class="verse-hero">'+esc(main.verses.map(function(v){return v.t;}).join(' '))+'<cite>'+esc(main.ref)+' (KJV)</cite></div>'+
   '<button class="start" id="btnStart">▶ START</button>'+
   (pos>0 ? '<button class="resume" id="btnResume">Continue where you left off (step '+(pos+1)+' of '+SCREENS.length+')</button>' : '')+
   '</section>'+
   '<details class="studymore"><summary>Study More</summary><div class="menu">'+
   '<button data-go="learn">Learn the Teaching<small>Beginner · Intermediate · Advanced</small></button>'+
   '<button data-go="decls">Declarations<small>'+S.decl.length+' prayers and declarations, in order</small></button>'+
   '<button data-go="directions">Original Directions<small>'+S.directions.length+' instructions, in order</small></button>'+
   '<button data-go="family">My Family Prayers<small>Enter names once</small></button>'+
   '<button data-go="memory">Scripture Memory Cards<small>'+S.memory.length+' verses</small></button>'+
   '<button data-go="quiz">Bible Quiz<small>5 · 7 · 10 questions</small></button>'+
   '<button data-go="scriptures">All Scriptures<small>Every passage, full KJV</small></button>'+
   '<button data-go="transcript">Full Transcript<small>Searchable · printable</small></button>'+
   '<button data-go="about">About &amp; Sources<small>How this was prepared</small></button>'+
   '</div></details>'+
   '<div class="footer">L137 · Luke 1:37 · For with God nothing shall be impossible.</div></div>';
  app.innerHTML = h; top();
  $('#btnStart').onclick = function(){ store.set('pos',0); guide(0, true); };
  if($('#btnResume')) $('#btnResume').onclick = function(){ guide(pos, true); };
  app.querySelectorAll('[data-go]').forEach(function(b){ b.onclick = function(){ go(b.getAttribute('data-go')); }; });
}

function complete(){
  setTitle('Completed'); showBar(false); stopAudio(true);
  app.innerHTML = '<div class="wrap" style="text-align:center;padding-top:30px"><div class="eyebrow">Guided prayer complete</div><h1>You have finished the service</h1>'+
   scripHTML('Luke 1:37')+'<p>Continue in Study More: learn the teaching, pray for your family, practise the memory verses, and take the quiz.</p>'+
   '<button class="btn solid" data-go="learn">Learn the Teaching</button><button class="btn" data-go="family">My Family Prayers</button><button class="btn" data-go="quiz">Bible Quiz</button><button class="btn" data-go="home">Home</button></div>';
  bindGo(); top();
}
function bindGo(){ app.querySelectorAll('[data-go]').forEach(function(b){ b.onclick = function(){ go(b.getAttribute('data-go')); }; }); }
function backHome(){ return '<div class="navrow"><button data-go="home">‹ Home</button></div>'; }

/* Learn */
function learn(level){
  level = level || store.get('level','beginner'); store.set('level', level);
  setTitle('Learn the Teaching'); showBar(true); stopAudio(true); current=null; load([], null, '');
  var L = S.levels[level];
  var h = '<div class="wrap"><h1>Learn the Teaching</h1><span class="tag">Supplementary biblical study</span><p class="note">These lessons are study helps. They are not the minister\'s words. Quotations from the service are marked.</p>'+
   '<div class="tabs" role="tablist">'+['beginner','intermediate','advanced'].map(function(k){ return '<button role="tab" aria-selected="'+(k===level)+'" data-level="'+k+'">'+S.levels[k].label+'</button>'; }).join('')+'</div>'+
   '<p>'+esc(L.intro)+'</p>';
  L.cards.forEach(function(c, ci){
    h += '<article class="card" id="c'+ci+'"><div class="count">Lesson '+(ci+1)+' of '+L.cards.length+'</div><h3>'+esc(c.title)+'</h3>';
    if(c.word){ h += '<div class="word">'+(c.word[0]?'<span class="num">'+esc(c.word[0])+'</span>':'')+'<span class="tr">'+esc(c.word[1])+'</span></div><p>'+esc(c.word[2])+'</p>'; }
    if(c.context) h += '<p><b>Context.</b> '+esc(c.context)+'</p>';
    if(c.quote) h += '<div class="q">“'+esc(c.quote[1])+'”<cite>Direct quotation · '+esc(c.quote[0])+', service of '+esc(M.date)+'</cite></div>';
    if(c.simple) h += '<p><b>What does this mean?</b> '+esc(c.simple)+'</p>';
    if(c.meaning) h += '<p><b>'+esc(c.meaning.split(':')[0])+':</b>'+esc(c.meaning.slice(c.meaning.indexOf(':')+1))+'</p>';
    if(c.application) h += '<div class="q">'+esc(c.application.replace(/^Service application: /,''))+'<cite>Service application (direct quotation from the service)</cite></div>';
    if(c.key) h += '<div class="k"><b>Key point:</b> '+esc(c.key)+'</div>';
    (c.commentary||[]).forEach(function(q){ var s=S.src[q[2]]; h += '<div class="q">“'+esc(q[1])+'”<cite>'+esc(q[0])+' · <a href="'+s.url+'" target="_blank" rel="noopener">'+esc(s.name)+'</a></cite></div>'; });
    h += '<button class="tap-reveal" data-reveal="rv'+ci+'">Tap to read '+c.refs.map(function(r){return scrip(r).ref;}).join(', ')+' (KJV)</button><div id="rv'+ci+'" hidden>'+c.refs.map(function(r){return scripHTML(r);}).join('')+'</div>';
    h += '<button class="btn" data-listen="'+ci+'">▶ Listen</button>';
    if(c.src && c.src.length) h += '<div class="src">Sources: '+c.src.map(function(k){ var s=S.src[k]; return '<a href="'+s.url+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>'; }).join(' · ')+' · Scripture: King James Version.</div>';
    h += '</article>';
  });
  h += '<div class="card" style="text-align:center"><h3>Check what you learned</h3><button class="btn solid" data-quiz="'+level+'">Take the '+L.label+' quiz ('+S.quiz[level].length+' questions)</button></div>'+backHome()+'</div>';
  app.innerHTML = h; top(); bindGo();
  app.querySelectorAll('[data-level]').forEach(function(b){ b.onclick = function(){ learn(b.getAttribute('data-level')); }; });
  app.querySelectorAll('[data-reveal]').forEach(function(b){ b.onclick = function(){ var x=document.getElementById(b.getAttribute('data-reveal')); x.hidden=!x.hidden; }; });
  app.querySelectorAll('[data-quiz]').forEach(function(b){ b.onclick = function(){ quiz(b.getAttribute('data-quiz')); }; });
  app.querySelectorAll('[data-listen]').forEach(function(b){ b.onclick = function(){ var c=L.cards[+b.getAttribute('data-listen')], t=[c.title+'.'];
    if(c.word) t.push(c.word[1]+'. '+c.word[2]); if(c.context) t.push(c.context); if(c.quote) t.push('The service said: '+c.quote[1]); if(c.simple) t.push(c.simple); if(c.meaning) t.push(c.meaning); if(c.application) t.push(c.application); if(c.key) t.push('Key point. '+c.key);
    c.refs.forEach(function(r){ t.push('Scripture reading. '+scrip(r).ref+'. '+scripText(r)); }); quickSpeak(t, c.title); }; });
}

/* Quiz */
function quiz(level){
  setTitle('Bible Quiz'); showBar(false); stopAudio(true);
  if(!level){
    var best = store.get('best',{});
    app.innerHTML = '<div class="wrap"><h1>Bible Quiz</h1><p>One question at a time. Choose an answer to see if it is correct, with the King James verse.</p>'+
     ['beginner','intermediate','advanced'].map(function(k){ return '<button class="row opt" data-quiz="'+k+'"><b>'+S.levels[k].label+'</b> · '+S.quiz[k].length+' questions'+(best[k]!=null?' · best score '+best[k]+'/'+S.quiz[k].length:'')+'</button>'; }).join('')+backHome()+'</div>';
    top(); bindGo(); app.querySelectorAll('[data-quiz]').forEach(function(b){ b.onclick=function(){ quiz(b.getAttribute('data-quiz')); }; }); return;
  }
  var Q = S.quiz[level], qi = 0, score = 0;
  function show(){
    var q0 = Q[qi], order = q0.o.map(function(_,k){ return k; });
    for(var k=order.length-1;k>0;k--){ var j=Math.floor(Math.random()*(k+1)), t=order[k]; order[k]=order[j]; order[j]=t; }
    var q = {q:q0.q, o:order.map(function(k){ return q0.o[k]; }), a:order.indexOf(q0.a), ref:q0.ref, why:q0.why, src:q0.src};
    app.innerHTML = '<div class="wrap"><div class="count">'+S.levels[level].label+' quiz · Question '+(qi+1)+' of '+Q.length+'</div><div class="progress"><i style="width:'+Math.round(qi/Q.length*100)+'%"></i></div>'+
     '<h2 style="margin-top:12px">'+esc(q.q)+'</h2><div id="opts">'+q.o.map(function(o,oi){ return '<button class="opt" data-o="'+oi+'">'+esc(o)+'</button>'; }).join('')+'</div><div id="fb"></div></div>';
    top();
    app.querySelectorAll('[data-o]').forEach(function(b){ b.onclick = function(){
      var pick = +b.getAttribute('data-o'), right = pick === q.a; if(right) score++;
      app.querySelectorAll('[data-o]').forEach(function(x){ x.disabled = true; var oi=+x.getAttribute('data-o'); if(oi===q.a) x.classList.add('correct'); else if(oi===pick) x.classList.add('wrong'); });
      var src = q.src ? ' <a href="'+S.src[q.src].url+'" target="_blank" rel="noopener">'+esc(S.src[q.src].name)+'</a>' : '';
      $('#fb').innerHTML = '<div class="fb '+(right?'good':'bad')+'">'+(right?'Correct.':'Not quite. The correct answer is: <b>'+esc(q.o[q.a])+'</b>.')+(q.why?' '+esc(q.why):'')+src+'</div>'+scripHTML(q.ref)+
        '<div class="navrow"><button class="primary" id="qNext">'+(qi===Q.length-1?'See my score':'Next question ›')+'</button></div>';
      $('#qNext').onclick = function(){ qi++; if(qi<Q.length) show(); else end(); };
    }; });
  }
  function end(){
    var best = store.get('best',{}); if(best[level]==null || score>best[level]){ best[level]=score; store.set('best',best); }
    app.innerHTML = '<div class="wrap" style="text-align:center"><h1>'+S.levels[level].label+' quiz</h1><div class="score">'+score+' / '+Q.length+'</div><p>'+(score===Q.length?'Every answer correct.':'Review the verses and try again.')+'</p>'+
      '<button class="btn solid" id="retry">Try again</button><button class="btn" data-go="learn">Back to lessons</button><button class="btn" data-go="quiz">Other quizzes</button></div>';
    top(); bindGo(); $('#retry').onclick = function(){ quiz(level); };
  }
  show();
}

/* Declarations library + player */
function decls(start){
  setTitle('Declarations'); stopAudio(true); current=null;
  if(start==null){
    showBar(false);
    var h = '<div class="wrap"><h1>Declarations and Prayers</h1><p>Every declaration and prayer from the service, in the order spoken. Words in [square brackets] were unclear in the recording; the bracketed word is a suggested reading.</p>'+
      '<button class="btn solid" id="playAll">▶ Pray all '+S.decl.length+' in order</button><ul class="list">';
    S.decl.forEach(function(d,i){ h += '<li><button class="row" data-d="'+i+'"><small>'+(i+1)+' of '+S.decl.length+' · '+d.type+' · '+esc(d.who)+' · '+d.ts+'</small>'+bracketNote(d.text)+'</button></li>'; });
    app.innerHTML = h+'</ul>'+backHome()+'</div>'; top(); bindGo();
    $('#playAll').onclick = function(){ decls(0); };
    app.querySelectorAll('[data-d]').forEach(function(b){ b.onclick = function(){ decls(+b.getAttribute('data-d')); }; });
    return;
  }
  var i = Math.max(0, Math.min(start, S.decl.length-1)), d = S.decl[i];
  showBar(true);
  app.innerHTML = '<div class="wrap">'+declHTML(d, i+1, S.decl.length)+'<div class="navrow"><button id="dPrev"'+(i===0?' disabled':'')+'>‹ Previous</button><button class="primary" id="dNext">'+(i===S.decl.length-1?'Done':'Next ›')+'</button></div><div class="navrow"><button id="dList">All declarations</button></div></div>';
  top(); bindRef();
  load(declQueue(d), function(){ if(autoBox.checked && i < S.decl.length-1) { decls(i+1); playAt(0); } }, 'Declaration '+(i+1)+' of '+S.decl.length);
  current = {rebuild: function(){ decls(i); }};
  $('#dPrev').onclick = function(){ var p=A.playing; decls(i-1); if(p) playAt(0); };
  $('#dNext').onclick = function(){ if(i===S.decl.length-1) return decls(); var p=A.playing; decls(i+1); if(p) playAt(0); };
  $('#dList').onclick = function(){ decls(); };
}

/* Original directions */
function directions(){
  setTitle('Original Directions'); showBar(true); stopAudio(true); current=null; load([],null,'');
  var h = '<div class="wrap"><h1>Original Directions</h1><p>The instructions given during the service, word for word, in order. Nothing has been added.</p><ul class="list">';
  S.directions.forEach(function(d,i){ h += '<li class="box dir" id="dr'+i+'"><div class="count">'+(i+1)+' of '+S.directions.length+' · '+esc(d.who)+' · '+d.ts+'</div>'+chip(d.cue)+'<p style="margin-top:8px">“'+esc(d.text)+'”</p></li>'; });
  app.innerHTML = h+'</ul><button class="btn solid" id="listenDirs">▶ Listen to all directions</button>'+backHome()+'</div>'; top(); bindGo();
  $('#listenDirs').onclick = function(){ var q=[]; S.directions.forEach(function(d,i){ q.push({text:'Direction '+(i+1)+'. '+CUE[d.cue]+'.', el:'dr'+i}); splitText(d.text).forEach(function(c){ q.push({text:c, el:'dr'+i}); }); q.push({pause:1500, el:'dr'+i}); }); load(q,null,'Original directions'); playAt(0); };
}

/* Scriptures library */
function scriptures(){
  setTitle('All Scriptures'); showBar(true); stopAudio(true); current=null; load([],null,'');
  var h = '<div class="wrap"><h1>All Scriptures</h1><p>Every passage read or referred to in the service, King James Version, in service order. Tap a reference to reveal the full text.</p>';
  var n = 0;
  S.sections.forEach(function(s){ if(!s.refs.length) return; h += '<h3 class="secthead">'+esc(s.title)+'</h3>';
    s.refs.forEach(function(r){ n++; h += '<button class="tap-reveal" data-reveal="sr'+n+'">'+esc(scrip(r).ref)+'</button><div id="sr'+n+'" hidden>'+scripHTML(r)+'<button class="btn" data-say="'+r+'">▶ Listen</button></div>'; }); });
  app.innerHTML = h+backHome()+'</div>'; top(); bindGo();
  app.querySelectorAll('[data-reveal]').forEach(function(b){ b.onclick = function(){ var x=document.getElementById(b.getAttribute('data-reveal')); x.hidden=!x.hidden; }; });
  app.querySelectorAll('[data-say]').forEach(function(b){ b.onclick = function(){ var r=b.getAttribute('data-say'); quickSpeak([scrip(r).ref+'.', scripText(r)], scrip(r).ref); }; });
}

/* Memory cards */
function memory(i){
  i = i || 0; var ref = S.memory[i], s = scrip(ref), mode = store.get('memmode','full');
  setTitle('Memory Cards'); showBar(true); stopAudio(true); current=null; load([],null,'');
  var words = scripText(ref).split(' '), txt;
  if(mode==='full') txt = esc(scripText(ref));
  else if(mode==='hidden') txt = '<span class="note">The verse is hidden. Say it from memory, then tap Show.</span>';
  else txt = words.map(function(w,wi){ return (wi%3===1) ? '<span class="blank" tabindex="0" role="button" aria-label="hidden word, tap to reveal">'+esc(w)+'</span>' : esc(w); }).join(' ');
  app.innerHTML = '<div class="wrap"><div class="count">Card '+(i+1)+' of '+S.memory.length+'</div><div class="card mem"><h2>'+esc(s.ref)+'</h2><div class="text">'+txt+'</div></div>'+
   '<div class="tabs"><button aria-selected="'+(mode==='full')+'" data-m="full">Show</button><button aria-selected="'+(mode==='blanks')+'" data-m="blanks">Practise</button><button aria-selected="'+(mode==='hidden')+'" data-m="hidden">Hide</button></div>'+
   '<button class="btn solid" id="memPlay">▶ Listen</button><button class="btn" id="memPlay2">▶ Listen and repeat</button>'+
   '<div class="navrow"><button id="mPrev"'+(i===0?' disabled':'')+'>‹ Previous</button><button class="primary" id="mNext"'+(i===S.memory.length-1?' disabled':'')+'>Next Scripture ›</button></div>'+backHome()+'</div>';
  top(); bindGo();
  app.querySelectorAll('[data-m]').forEach(function(b){ b.onclick = function(){ store.set('memmode', b.getAttribute('data-m')); memory(i); }; });
  app.querySelectorAll('.blank').forEach(function(b){ b.onclick = b.onkeydown = function(e){ if(e.type==='keydown' && e.key!=='Enter' && e.key!==' ') return; b.classList.add('show'); }; });
  $('#memPlay').onclick = function(){ quickSpeak([s.ref+'.', scripText(ref)], s.ref); };
  $('#memPlay2').onclick = function(){ var q=[{text:s.ref+'. Repeat after me.'}]; splitText(scripText(ref)).forEach(function(c){ q.push({text:c}); q.push({pause:Math.max(2500,c.split(' ').length*600)}); }); load(q,null,s.ref); playAt(0); };
  $('#mPrev').onclick = function(){ memory(i-1); }; $('#mNext').onclick = function(){ memory(i+1); };
}

/* Family prayers */
function family(){
  setTitle('My Family Prayers'); showBar(true); stopAudio(true); current=null; load([],null,'');
  var n = store.get('names', {me:'',spouse:'',children:'',parents:'',others:''});
  function list(s){ return s.split(',').map(function(x){return x.trim();}).filter(Boolean); }
  function join(a){ return a.length<2 ? (a[0]||'') : a.slice(0,-1).join(', ')+' and '+a[a.length-1]; }
  function fill(t){
    var me=n.me.trim(), sp=n.spouse.trim(), ch=list(n.children), pa=list(n.parents), ot=list(n.others);
    var fam = [].concat(me?[me]:[], sp?[sp]:[], ch, pa, ot);
    var map = {me: me||'myself', spouse: sp||'my spouse', children: ch.length?join(ch):'my children', parents: pa.length?join(pa):'my parents', others: ot.length?join(ot):'my loved ones', family: fam.length?join(fam):'my family'};
    return t.replace(/\{(\w+)\}/g, function(_,k){ return map[k]; });
  }
  var h = '<div class="wrap"><h1>My Family Prayers</h1><span class="tag">Personalized prayers</span><p class="note">These prayers are built from King James Scripture used in the service. They are not the minister\'s original declarations. Names stay only on this device.</p>'+
   '<div class="card"><div class="field"><label for="nMe">Your name</label><input id="nMe" autocomplete="off" value="'+esc(n.me)+'"></div>'+
   '<div class="field"><label for="nSp">Spouse\'s name</label><input id="nSp" autocomplete="off" value="'+esc(n.spouse)+'"></div>'+
   '<div class="field"><label for="nCh">Children\'s names (separate with commas)</label><input id="nCh" autocomplete="off" value="'+esc(n.children)+'"></div>'+
   '<div class="field"><label for="nPa">Parents\' names</label><input id="nPa" autocomplete="off" value="'+esc(n.parents)+'"></div>'+
   '<div class="field"><label for="nOt">Other family members and loved ones</label><input id="nOt" autocomplete="off" value="'+esc(n.others)+'"></div>'+
   '<button class="btn solid" id="saveNames">Save names on this device</button> <span class="note" id="saved"></span></div><div id="prayers"></div>'+backHome()+'</div>';
  app.innerHTML = h; top(); bindGo();
  function render(){
    $('#prayers').innerHTML = S.family.map(function(p,pi){ return '<article class="card" id="fp'+pi+'"><div class="count">Prayer '+(pi+1)+' of '+S.family.length+'</div><h3>'+esc(p.title)+'</h3><p style="font-family:var(--serif);font-size:1.1rem">'+esc(fill(p.text))+'</p>'+
      '<button class="tap-reveal" data-reveal="fv'+pi+'">Read '+esc(scrip(p.ref).ref)+' (KJV)</button><div id="fv'+pi+'" hidden>'+scripHTML(p.ref)+'</div>'+
      '<button class="btn" data-fl="'+pi+'">▶ Listen</button><button class="btn" data-fc="'+pi+'">Copy</button><button class="btn" data-fs="'+pi+'">Share</button></article>'; }).join('');
    app.querySelectorAll('[data-reveal]').forEach(function(b){ b.onclick = function(){ var x=document.getElementById(b.getAttribute('data-reveal')); x.hidden=!x.hidden; }; });
    app.querySelectorAll('[data-fl]').forEach(function(b){ b.onclick = function(){ var p=S.family[+b.getAttribute('data-fl')]; quickSpeak([p.title+'.', fill(p.text)], p.title); }; });
    app.querySelectorAll('[data-fc]').forEach(function(b){ b.onclick = function(){ var p=S.family[+b.getAttribute('data-fc')]; copy(p.title+'\n\n'+fill(p.text)+'\n\n'+scrip(p.ref).ref+' (KJV): '+scripText(p.ref), b); }; });
    app.querySelectorAll('[data-fs]').forEach(function(b){ b.onclick = function(){ var p=S.family[+b.getAttribute('data-fs')], t=p.title+'\n\n'+fill(p.text)+'\n\n'+scrip(p.ref).ref+' (KJV): '+scripText(p.ref);
      if(navigator.share){ navigator.share({title:p.title, text:t}).catch(function(){}); } else copy(t, b); }; });
  }
  function readInputs(){ n = {me:$('#nMe').value, spouse:$('#nSp').value, children:$('#nCh').value, parents:$('#nPa').value, others:$('#nOt').value}; }
  ['#nMe','#nSp','#nCh','#nPa','#nOt'].forEach(function(id){ $(id).oninput = function(){ readInputs(); render(); }; });
  $('#saveNames').onclick = function(){ readInputs(); store.set('names', n); $('#saved').textContent = store.ok ? 'Saved on this device.' : 'Saved for this visit (this browser does not allow saving).'; };
  render();
}
function copy(t, btn){
  function ok(){ var o=btn.textContent; btn.textContent='Copied'; setTimeout(function(){ btn.textContent=o; },1500); }
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(ok, fallback); } else fallback();
  function fallback(){ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); ok(); }catch(e){} document.body.removeChild(ta); }
}

/* Transcript */
function transcript(){
  setTitle('Full Transcript'); showBar(false); stopAudio(true); current=null;
  var h = '<div class="wrap"><h1>Clean Public Transcript</h1><p class="note">'+esc(M.title)+' · '+esc(M.minister)+' · '+esc(M.date)+'. Participants\' names, personal prophecies, and personal conversations are removed for privacy and marked in brackets. Every other word is as transcribed.</p>'+
    '<input class="search" id="q" type="search" placeholder="Search the transcript" aria-label="Search the transcript"><p class="note" id="qn"></p><button class="btn" onclick="window.print()">Print or save as PDF</button><a class="btn" href="transcript.pdf" target="_blank" rel="noopener">Download PDF</a><div id="tx"></div>'+backHome()+'</div>';
  app.innerHTML = h; top(); bindGo();
  function render(term){
    var re = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi') : null, hits = 0, out='';
    S.sections.forEach(function(s,si){
      out += '<h3 class="secthead">Part '+(si+1)+'. '+esc(s.title)+' <span class="note">('+s.start+')</span></h3>';
      s.blocks.forEach(function(b){ var t = esc(b.t); if(re){ t = t.replace(re, function(m){ hits++; return '<mark>'+m+'</mark>'; }); }
        out += b.who ? '<p><span class="who" style="display:block;font-size:.72rem;font-weight:700;color:var(--muted)">'+esc(b.who)+' · '+b.ts+'</span>'+t+'</p>' : '<p class="mark" style="color:var(--muted);font-style:italic">'+t+'</p>'; });
    });
    $('#tx').innerHTML = out; $('#qn').textContent = term ? hits+' match'+(hits===1?'':'es') : '';
    if(term){ var m = document.querySelector('#tx mark'); if(m) m.scrollIntoView({block:'center'}); }
  }
  var tmr; $('#q').oninput = function(){ clearTimeout(tmr); var v=this.value.trim(); tmr=setTimeout(function(){ render(v.length>1?v:''); }, 250); };
  render('');
}

/* About */
function about(){
  setTitle('About & Sources'); showBar(false); stopAudio(true); current=null;
  var notes = S.decl.filter(function(d){ return /\[/.test(d.text); });
  var h = '<div class="wrap"><h1>About this study</h1>'+
   '<div class="card"><h3>What is in this tool</h3><p><b>Original prophetic direction:</b> the service transcript, the declarations, and the directions, in the order given. Section titles are study labels only.</p><p><b>Supplementary biblical study:</b> the Learn lessons, word studies, and Scripture notes.</p><p><b>Personalized prayers:</b> My Family Prayers, built from Scripture used in the service.</p><p><b>Interactive quizzes:</b> questions drawn from the King James text.</p></div>'+
   '<div class="card"><h3>Privacy</h3><p>Participants\' names, personal prophecies, individual ministry, and personal conversations about giving were removed from the public transcript. Names you type in My Family Prayers stay on your device and are never sent anywhere.</p></div>'+
   '<div class="card"><h3>Transcription notes</h3><p>The recording was transcribed automatically. Long passages of praying in tongues and unclear audio are marked in brackets. Words in [square brackets] inside a declaration were unclear; the bracketed word is a suggested reading:</p><ul>'+notes.map(function(d){ return '<li>'+d.ts+': '+bracketNote(d.text)+'</li>'; }).join('')+'</ul></div>'+
   '<div class="card"><h3>Scripture notes</h3><ul><li>2 Kings 4:8-9 (KJV) names Elisha as the man of God the Shunammite woman honored. The service said "the prophet Elijah."</li><li>2 Kings 2:19-22 (KJV) records Elisha healing the waters of Jericho.</li><li>The names heard as "Ruby" and "Rupi" match Reuben (Genesis 49:3-4; Deuteronomy 33:6).</li><li>The King James Bible names the angels Michael and Gabriel. The name Raphael is not in the 66 books of the KJV.</li></ul></div>'+
   '<div class="card"><h3>Health</h3><p>The service also said, "Doctors will do their part." Keep taking prescribed treatment and follow your doctor\'s advice while you pray.</p></div>'+
   '<div class="card"><h3>Sources</h3><ul><li>Scripture: King James Version (public domain).</li>'+Object.keys(S.src).map(function(k){ var s=S.src[k]; return '<li><a href="'+s.url+'" target="_blank" rel="noopener">'+esc(s.name)+'</a></li>'; }).join('')+'</ul></div>'+
   '<div class="card"><h3>Audio</h3><p>Audio uses your phone\'s built-in reading voice. It is not the voice of any minister. On iPhone, turn off silent mode and raise the volume.</p></div>'+
   backHome()+'</div>';
  app.innerHTML = h; top(); bindGo();
}

/* router */
var routes = {home:home, learn:function(){learn();}, quiz:function(){quiz();}, decls:function(){decls();}, directions:directions, scriptures:scriptures, memory:function(){memory(0);}, family:family, transcript:transcript, about:about, complete:complete};
function go(r){ (routes[r]||home)(); }
window.addEventListener('beforeunload', function(){ if(synth) synth.cancel(); });
document.addEventListener('visibilitychange', function(){ /* keep speaking in background where the browser allows */ });
home();
})();
