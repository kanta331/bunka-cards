/* 図示（D-figure）。cards.json の figure から SVG を作る。
   表面と review.html の両方で使う。枠は英単語版のコアイメージと同じ 380×140 */
(function(){
  var W=380, H=140;

  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  /* 全角=1、半角の大文字=0.72、数字=0.62、そのほかの半角=0.55 の幅 */
  function width(t){ var w=0; for(var ch of t) w+=/[A-Z]/.test(ch) ? .72 : /[0-9]/.test(ch) ? .62 : /[\x20-\x7e]/.test(ch) ? .55 : 1; return w; }
  /* 1行 n 字までで折る（最大2行）。行頭に ー・小さいかな・閉じ括弧を置かない。
     ・や空白の後、カタカナの切れ目、かなから漢字に変わる所を優先する */
  var KATA=/[ァ-ヺー]/, KANJI=/[一-龯々]/, HIRA=/[ぁ-ん]/, NOHEAD=/[ーァィゥェォャュョッヮぁぃぅぇぉゃゅょっ）」、。]/;
  /* label の半角スペースは改行位置の目印。1行に収まるときは、日本語どうしの間のスペースを消して出す */
  function oneLine(t){ return t.replace(/([^\x00-\x7f]) (?=[^\x00-\x7f])/g, '$1'); }
  function wrap(t, n){
    if(width(oneLine(t))<=n) return [oneLine(t)];
    var sp=t.indexOf(' ');
    if(sp>0){
      var a=t.slice(0, sp), b=t.slice(sp+1);
      if(width(a)<=n && width(b)<=n) return [a, b];
    }
    t=oneLine(t);
    var chars=Array.from(t), best=-1, bestD=1e9;
    for(var i=1;i<chars.length;i++){
      var p=chars[i-1], q=chars[i];
      if(NOHEAD.test(q)) continue;
      var a=width(chars.slice(0,i).join('')), b=width(chars.slice(i).join(''));
      if(a>n || b>n) continue;
      var bonus=/[・ ]/.test(p) || /[（「]/.test(q) ? 4
        : (HIRA.test(p) && !HIRA.test(q)) ? 3.5
        : (KATA.test(p) !== KATA.test(q) && !HIRA.test(q)) ? 2.5 : 0;
      var d=Math.abs(a-b)-bonus;
      if(d<bestD){ bestD=d; best=i; }
    }
    if(best<0) best=Math.ceil(chars.length/2);
    return [chars.slice(0,best).join(''), chars.slice(best).join('')];
  }

  /* 年表：横向き、左から古い順。点と年号と label。未確認（verified:false）の点は白抜き */
  function timeline(f){
    var ev=f.events||[], n=ev.length;
    if(!n) return '';
    /* 端の label がはみ出さないよう左右に余白を取り、1行の字数は「隣との間隔」と「端の余白×2」の狭い方で決める */
    var M=50, x0=M, x1=W-M, step=n>1 ? (x1-x0)/(n-1) : 0, axisY=54, LAB=n>=5 ? 12.5 : 14;
    var room=Math.min(n>1 ? step : W, 2*M+8), perLine=Math.max(4, Math.floor((room-5)/LAB));
    var s='<line class="tl-axis" x1="12" y1="'+axisY+'" x2="'+(W-12)+'" y2="'+axisY+'"/>';
    ev.forEach(function(e, i){
      var x=n>1 ? x0+step*i : W/2, ok=e.verified!==false;
      /* 年号はその点で使える幅（隣との間隔と、枠の端までの距離の2倍）に収まる大きさに */
      var r=Math.min(n>1 ? step : W, 2*Math.min(x, W-x)-6), yearFs=Math.min(17, r/(width(e.year)*1.12));
      var lines=wrap(e.label, perLine);
      s+='<g class="tl-ev'+(ok ? '' : ' unv')+'" style="--i:'+i+'">'
        +'<text class="tl-year" x="'+x+'" y="'+(axisY-15)+'" text-anchor="middle" style="font-size:'+yearFs.toFixed(1)+'px">'+esc(e.year)+'</text>'
        +'<circle class="tl-dot" cx="'+x+'" cy="'+axisY+'" r="6"/>'
        +lines.map(function(l, k){
          return '<text class="tl-lab" x="'+x+'" y="'+(axisY+27+k*17)+'" text-anchor="middle" style="font-size:'+LAB+'px">'+esc(l)+'</text>';
        }).join('')
        +'</g>';
    });
    return s;
  }

  /* ---------- 概念図 ----------
     8型（flow / contrast / contain / cycle / balance / hub / layer / mediate）。
     ノードの置き場所は型が決め、edges はその位置どうしを結ぶ。図は上 0〜114、note は下の帯 */
  var FS=14, LH=17, AREA=114, seq=0;

  /* ノード1つ。shape は box / circle / person / wall。返り値は描画と、線をつなぐための半幅・半高 */
  function node(nd, cx, cy, maxW, i){
    var cls='nd sh-'+(nd.shape||'box')+(nd.verified===false ? ' unv' : '');
    var per=Math.max(3, Math.floor((maxW-14)/FS)), lines=wrap(nd.label||'', per);
    var tw=Math.max.apply(null, lines.map(function(l){ return width(l); }))*FS;
    var th=lines.length*LH;
    function text(y0){
      return lines.map(function(l, k){
        return '<text x="'+cx+'" y="'+(y0+k*LH)+'" text-anchor="middle">'+esc(l)+'</text>';
      }).join('');
    }
    var g='<g class="'+cls+'" style="--i:'+i+'">', hw, hh;
    if(nd.shape==='person'){
      hw=Math.max(tw/2, 14)+2; hh=(th+30)/2;
      var top=cy-hh;
      g+='<circle class="ic" cx="'+cx+'" cy="'+(top+6)+'" r="6"/>'
        +'<path class="ic" d="M'+(cx-11)+' '+(top+27)+'q0-12 11-12t11 12z"/>'
        +text(top+30+LH-4);
    }else if(nd.shape==='circle'){
      hw=Math.max(tw/2+12, 26); hh=Math.max(th/2+10, 22);
      g+='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+hw+'" ry="'+hh+'"/>'+text(cy-th/2+LH-4);
    }else{
      hw=Math.max(tw/2+10, 26); hh=th/2+8;
      g+='<rect x="'+(cx-hw)+'" y="'+(cy-hh)+'" width="'+(2*hw)+'" height="'+(2*hh)+'" rx="'+(nd.shape==='wall' ? 2 : 8)+'"/>'
        +text(cy-th/2+LH-4);
    }
    return { svg:g+'</g>', hw:hw, hh:hh, x:cx, y:cy };
  }

  /* 中心どうしを結ぶ線を、両端のノードの枠で切る */
  function clip(a, b){
    var dx=b.x-a.x, dy=b.y-a.y;
    function t(n){ var tx=dx ? n.hw/Math.abs(dx) : 1e9, ty=dy ? n.hh/Math.abs(dy) : 1e9; return Math.min(tx, ty); }
    var ta=t(a)+.03, tb=t(b)+.03;
    return [a.x+dx*ta, a.y+dy*ta, b.x-dx*tb, b.y-dy*tb];
  }
  function edge(p, kind, uid, i, bow){
    var cls='eg'+(kind==='line' ? '' : ' hd'), m=kind==='line' ? '' : ' marker-end="url(#'+uid+'-a)"';
    if(kind==='both') m+=' marker-start="url(#'+uid+'-a)"';
    var d;
    if(bow){
      var mx=(p[0]+p[2])/2, my=(p[1]+p[3])/2;
      d='M'+p[0].toFixed(1)+' '+p[1].toFixed(1)+'Q'+(mx+bow[0]).toFixed(1)+' '+(my+bow[1]).toFixed(1)+' '+p[2].toFixed(1)+' '+p[3].toFixed(1);
    }else{
      d='M'+p[0].toFixed(1)+' '+p[1].toFixed(1)+'L'+p[2].toFixed(1)+' '+p[3].toFixed(1);
    }
    return '<path class="'+cls+'" d="'+d+'" pathLength="1" style="--i:'+i+'"'+m+'/>';
  }

  /* 型ごとの置き場所。[x, y, 最大幅] をノードの順に返す */
  function layout(f){
    var n=f.nodes.length, c=AREA/2, p=[];
    switch(f.pattern){
      case 'flow':
      case 'mediate':
        var gap=n>3 ? 22 : 34, w=(W-24-gap*(n-1))/n;
        for(var i=0;i<n;i++) p.push([12+w/2+i*(w+gap), c, w]);
        break;
      case 'contrast':
        if(n===3) return [[82, c, 140], [298, c, 140], [190, c, 54]];   /* 3つ目は間の壁 */
        return [[95, c, 160], [285, c, 160]];
      case 'contain':
        p.push([W/2, 0, W-20]);   /* 外箱（描き方は別） */
        var k=n-1, w2=(W-60-14*(k-1))/k;
        for(var j=0;j<k;j++) p.push([30+w2/2+j*(w2+14), c+10, w2]);
        break;
      case 'cycle':
        var rx=n>3 ? 128 : 118, ry=n>3 ? 36 : 34;
        for(var m=0;m<n;m++){
          var a=-Math.PI/2+m*2*Math.PI/n;
          p.push([W/2+rx*Math.cos(a), c+ry*Math.sin(a)+(n===3 ? 6 : 0), n>3 ? 120 : 130]);
        }
        break;
      case 'balance':
        p.push([78, c+20, 128], [302, c+20, 128]);
        if(n>2) p.push([190, c+36, 110]);
        break;
      case 'hub':
        /* 下の段は note の帯に掛からない高さ（2行の箱でも 120 まで）に置く */
        p.push([W/2, n-1===3 ? 40 : c, 120]);
        var spots=n-1===2 ? [[62, c], [318, c]]
          : n-1===3 ? [[62, 26], [318, 26], [W/2, 94]]
          : [[62, 26], [318, 26], [62, 92], [318, 92]];
        spots.forEach(function(s){ p.push([s[0], s[1], 110]); });
        break;
      case 'layer':
        var h=AREA/n;
        for(var q=0;q<n;q++) p.push([W/2, h*q+h/2, W-40]);
        break;
    }
    return p;
  }

  function diagram(f){
    var nodes=f.nodes||[], n=nodes.length;
    if(!n) return '';
    var uid='fg'+(++seq), pos=layout(f), byId={}, s='';
    s+='<defs><marker id="'+uid+'-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
      +'<path d="M1 1L9 5L1 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>';
    var drawn=nodes.map(function(nd, i){
      var p=pos[i]||[W/2, AREA/2, 120];
      if(f.pattern==='contain' && i===0){
        /* 外箱：枠いっぱいの箱と左上の名前 */
        var lab=oneLine(nd.label||'');
        byId[nd.id]={ x:W/2, y:AREA/2, hw:W/2-10, hh:AREA/2-4 };
        return '<g class="nd outer sh-'+(nd.shape||'box')+(nd.verified===false ? ' unv' : '')+'"><rect x="10" y="4" width="'+(W-20)+'" height="'+(AREA-8)+'" rx="10"/>'
          +'<text x="22" y="24" text-anchor="start">'+esc(lab)+'</text></g>';
      }
      if(f.pattern==='layer'){
        var h=AREA/n, y0=h*i+2;
        byId[nd.id]={ x:W/2, y:p[1], hw:W/2-20, hh:h/2-3 };
        return '<g class="nd band sh-'+(nd.shape||'box')+(nd.verified===false ? ' unv' : '')+'" style="--i:'+i+'"><rect x="20" y="'+y0.toFixed(1)+'" width="'+(W-40)+'" height="'+(h-4).toFixed(1)+'" rx="6"/>'
          +'<text x="'+(W/2)+'" y="'+(p[1]+5).toFixed(1)+'" text-anchor="middle">'+esc(oneLine(nd.label||''))+'</text></g>';
      }
      var r=node(nd, p[0], p[1], p[2], i);
      byId[nd.id]=r;
      return r.svg;
    });
    /* 線 */
    var eg='';
    if(f.pattern==='balance'){
      /* 天秤：梁・支点・皿。左右のノードが皿に乗る */
      var c=AREA/2;
      eg+='<g class="bal"><path class="beam" d="M60 '+(c-14)+'H320"/>'
        +'<path class="fulc" d="M190 '+(c-14)+'l-14 30h28z"/>'
        +'<path class="str" d="M78 '+(c-14)+'V'+(c+20-(byId[nodes[0].id].hh||12))+'M302 '+(c-14)+'V'+(c+20-(byId[nodes[1].id].hh||12))+'"/></g>';
    }else if(f.pattern==='contrast'){
      if(n<3) eg+='<path class="divider" d="M190 10V'+(AREA-10)+'"/>';
    }else{
      (f.edges||[]).forEach(function(e, i){
        var a=byId[e.from], b=byId[e.to];
        if(!a || !b) return;
        var pts=clip(a, b), bow=null;
        if(f.pattern==='cycle'){
          /* 輪の外へ膨らませる */
          var mx=(a.x+b.x)/2-W/2, my=(a.y+b.y)/2-AREA/2, L=Math.hypot(mx, my)||1;
          bow=[mx/L*18, my/L*12];
        }
        eg+=edge(pts, e.kind||'arrow', uid, i, bow);
      });
    }
    s+='<g class="egs">'+eg+'</g>';
    if(f.pattern==='balance') s+='<g class="bal-pans">'+drawn.join('')+'</g>';
    else s+=drawn.join('');
    if(f.note) s+='<text class="note" x="'+(W/2)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(f.note)+'</text>';
    return s;
  }

  function svg(f){
    if(!f) return '';
    var body=f.type==='timeline' ? timeline(f) : f.type==='diagram' ? diagram(f) : '';
    if(!body) return '';
    var label=f.type==='timeline' ? '年表：'+(f.events||[]).map(function(e){ return e.year+' '+e.label; }).join('、')
      : '図：'+(f.nodes||[]).map(function(n){ return oneLine(n.label||''); }).join('、')+(f.note ? '。'+f.note : '');
    var cls='fig2 fig-'+f.type+(f.type==='diagram' ? ' pt-'+f.pattern : '');
    return '<svg class="'+cls+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(label)+'">'+body+'</svg>';
  }

  window.Figure={ svg:svg };
})();
