import { useState, useEffect, useMemo } from "react";

window.storage = {
  get: (key) => Promise.resolve({ value: localStorage.getItem(key) }),
  set: (key, value) => { 
    localStorage.setItem(key, value); 
    return Promise.resolve(); 
  }
};

const STORAGE_KEY = "trading-journal-trades-v2";
const INSTRUMENTS = ["Forex","Stocks","Crypto","Futures","Options","CFDs","Indices","Commodities"];
const SESSIONS = ["London","New York","Asian","London/NY Overlap","Other"];
const SETUPS = ["Breakout","Reversal","Trend Follow","Range","News Play","Support/Resistance","Pattern","Other"];
const EMOTIONS = ["Calm","Confident","Anxious","FOMO","Greedy","Fearful","Neutral","Impulsive"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const defaultForm = {
  date: new Date().toISOString().slice(0,10),
  symbol:"", instrument:"Forex", direction:"Long", session:"London", setup:"",
  entry:"", stopLoss:"", takeProfit:"", exitPrice:"", size:"",
  pnl:"", rMultiple:"", rr:"", accountRisk:"",
  duration:"", emotion:"Calm", discipline:5, followedPlan:true,
  notes:"", tags:"", screenshot:"",
};

function calcRR(entry, sl, tp) {
  const e=parseFloat(entry),s=parseFloat(sl),t=parseFloat(tp);
  if(!e||!s||!t) return "";
  const risk=Math.abs(e-s), reward=Math.abs(t-e);
  return risk ? (reward/risk).toFixed(2) : "";
}

function calcRMultiple(entry, sl, exit, direction) {
  const e=parseFloat(entry),s=parseFloat(sl),x=parseFloat(exit);
  if(!e||!s||!x) return "";
  const riskPerUnit=Math.abs(e-s);
  if(!riskPerUnit) return "";
  const dir = direction==="Short" ? -1 : 1;
  return ((x-e)*dir/riskPerUnit).toFixed(2);
}

function exportCSV(trades) {
  const headers = ["Date","Symbol","Instrument","Direction","Session","Setup","Entry","Stop Loss","Take Profit","Exit Price","Size","P&L ($)","R:R","R-Multiple","Account Risk %","Duration","Emotion","Discipline","Followed Plan","Tags","Notes"];
  const rows = trades.map(t => [
    t.date,t.symbol,t.instrument,t.direction,t.session,t.setup,
    t.entry,t.stopLoss,t.takeProfit,t.exitPrice,t.size,
    t.pnl,t.rr,t.rMultiple,t.accountRisk,t.duration,
    t.emotion,t.discipline,t.followedPlan?"Yes":"No",
    t.tags,`"${(t.notes||"").replace(/"/g,'""')}"`
  ]);
  const csv = [headers,...rows].map(r=>r.join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`tradelog-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function StatCard({ label, value, sub, color, small }) {
  return (
    <div style={{background:"var(--color-background-secondary)",borderRadius:10,padding:"12px 14px",minWidth:0}}>
      <div style={{fontSize:10,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{label}</div>
      <div style={{fontSize:small?16:20,fontWeight:600,color:color||"var(--color-text-primary)",lineHeight:1.2}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:2}}>{sub}</div>}
    </div>
  );
}

function Badge({text,color}) {
  const c={green:{bg:"#d4f3e3",text:"#1a6641"},red:{bg:"#fde4e4",text:"#a02020"},blue:{bg:"#dbeeff",text:"#1a4f8a"},amber:{bg:"#fef3d0",text:"#7a4f00"},gray:{bg:"var(--color-background-secondary)",text:"var(--color-text-secondary)"}};
  const s=c[color]||c.gray;
  return <span style={{fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20,background:s.bg,color:s.text,whiteSpace:"nowrap"}}>{text}</span>;
}

function CalendarHeatmap({trades, year, month}) {
  const [hovered,setHovered]=useState(null);
  const daysInMonth = new Date(year,month+1,0).getDate();
  const firstDay = new Date(year,month,1).getDay();
  const dayMap = {};
  trades.forEach(t => {
    const d=new Date(t.date+"T12:00:00");
    if(d.getFullYear()===year&&d.getMonth()===month&&t.pnl!=="") {
      const k=d.getDate();
      if(!dayMap[k]) dayMap[k]={pnl:0,count:0,rMs:[]};
      dayMap[k].pnl+=parseFloat(t.pnl||0);
      dayMap[k].count++;
      if(t.rMultiple!==""&&!isNaN(parseFloat(t.rMultiple))) dayMap[k].rMs.push(parseFloat(t.rMultiple));
    }
  });
  const allPnls = Object.values(dayMap).map(d=>Math.abs(d.pnl));
  const maxAbs = Math.max(...allPnls,1);
  const cellColor = (pnl) => {
    const intensity = Math.min(Math.abs(pnl)/maxAbs,1);
    if(pnl>0) return `rgba(34,163,85,${0.2+intensity*0.8})`;
    if(pnl<0) return `rgba(209,48,48,${0.2+intensity*0.8})`;
    return "var(--color-border-tertiary)";
  };
  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(<div key={`e${i}`}/>);
  for(let d=1;d<=daysInMonth;d++) {
    const data=dayMap[d];
    const isToday=new Date().getDate()===d&&new Date().getMonth()===month&&new Date().getFullYear()===year;
    const totalR=data?.rMs.length?data.rMs.reduce((a,b)=>a+b,0):null;
    cells.push(
      <div key={d}
        onMouseEnter={()=>data&&setHovered({d,data,totalR})}
        onMouseLeave={()=>setHovered(null)}
        style={{aspectRatio:"1",borderRadius:5,background:data?cellColor(data.pnl):"var(--color-background-secondary)",cursor:data?"pointer":"default",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",outline:isToday?"2px solid var(--color-border-primary)":"0.5px solid transparent",transition:"opacity 0.1s",gap:1}}>
        <span style={{fontSize:9,color:data?"rgba(255,255,255,0.9)":"var(--color-text-tertiary)",fontWeight:500,pointerEvents:"none"}}>{d}</span>
        {data&&<span style={{fontSize:7,color:"rgba(255,255,255,0.75)",pointerEvents:"none"}}>{data.count}t</span>}
      </div>
    );
  }
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
        {DAYS.map(d=><div key={d} style={{fontSize:9,color:"var(--color-text-tertiary)",textAlign:"center",padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>{cells}</div>
      {hovered?(
        <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",fontSize:12,display:"flex",gap:20,flexWrap:"wrap"}}>
          <span style={{fontWeight:600}}>{MONTHS[month]} {hovered.d}</span>
          <span style={{color:"var(--color-text-secondary)"}}>{hovered.data.count} trade{hovered.data.count>1?"s":""}</span>
          <span style={{fontWeight:600,color:hovered.data.pnl>=0?"#22a355":"#d13030"}}>{hovered.data.pnl>=0?"+":""}${hovered.data.pnl.toFixed(2)}</span>
          {hovered.totalR!==null&&<span style={{fontWeight:600,color:hovered.totalR>=0?"#22a355":"#d13030"}}>{hovered.totalR>=0?"+":""}{hovered.totalR.toFixed(2)}R</span>}
        </div>
      ):(
        <div style={{marginTop:12,height:36,borderRadius:8,background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>Hover a day to see details</span>
        </div>
      )}
    </div>
  );
}

function RMultipleChart({trades}) {
  const data = trades
    .filter(t=>t.rMultiple!==""&&t.rMultiple!==undefined&&!isNaN(parseFloat(t.rMultiple)))
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .slice(-50);
  if(!data.length) return (
    <div style={{fontSize:12,color:"var(--color-text-tertiary)",padding:"24px 0",textAlign:"center"}}>
      No R-multiple data yet.<br/>
      <span style={{fontSize:11}}>Log entry price + stop loss + exit price on trades to auto-calculate, or enter manually.</span>
    </div>
  );
  const vals=data.map(t=>parseFloat(t.rMultiple));
  const maxV=Math.max(...vals.map(Math.abs),1);
  const n=data.length;
  const svgW=Math.max(520, n*14+60);
  const barW=Math.max(7, Math.floor((svgW-60)/n)-2);
  const chartH=100;
  const zeroY=chartH/2+10;

  return (
    <div>
      <div style={{overflowX:"auto"}}>
        <svg viewBox={`0 0 ${svgW} ${chartH+30}`} width="100%" style={{display:"block",minWidth:300}}>
          <line x1={40} y1={10} x2={40} y2={chartH+10} stroke="var(--color-border-tertiary)" strokeWidth="0.5"/>
          <line x1={40} y1={zeroY} x2={svgW-10} y2={zeroY} stroke="var(--color-border-tertiary)" strokeWidth="0.5" strokeDasharray="3 3"/>
          <text x={36} y={zeroY+3} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end">0R</text>
          <text x={36} y={14} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end">+{maxV.toFixed(1)}R</text>
          <text x={36} y={chartH+8} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end">-{maxV.toFixed(1)}R</text>
          {data.map((t,i)=>{
            const v=parseFloat(t.rMultiple);
            const barH=Math.abs(v)/maxV*(chartH/2-4);
            const x=44+i*(barW+2);
            const isPos=v>=0;
            const y=isPos?zeroY-barH:zeroY;
            return (
              <g key={t.id}>
                <rect x={x} y={y} width={barW} height={Math.max(barH,1.5)} fill={isPos?"#22a355":"#d13030"} rx="1" opacity="0.85"/>
                {barH>12&&<text x={x+barW/2} y={isPos?y-2:y+barH+8} fontSize="7" fill="var(--color-text-tertiary)" textAnchor="middle">{v>0?"+":""}{v}</text>}
              </g>
            );
          })}
          <text x={44} y={chartH+26} fontSize="8" fill="var(--color-text-tertiary)">← older</text>
          <text x={svgW-10} y={chartH+26} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end">recent →</text>
        </svg>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
        {data.slice(-12).map(t=>(
          <div key={t.id} style={{fontSize:10,color:parseFloat(t.rMultiple)>=0?"#22a355":"#d13030",background:parseFloat(t.rMultiple)>=0?"#e6f7ed":"#fde4e4",padding:"1px 6px",borderRadius:10,fontWeight:600}}>
            {t.symbol} {parseFloat(t.rMultiple)>0?"+":""}{t.rMultiple}R
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TradingJournal() {
  const [trades,setTrades]=useState([]);
  const [view,setView]=useState("dashboard");
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(defaultForm);
  const [filterSymbol,setFilterSymbol]=useState("");
  const [filterDir,setFilterDir]=useState("All");
  const [filterResult,setFilterResult]=useState("All");
  const [detailId,setDetailId]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const now=new Date();
  const [calYear,setCalYear]=useState(now.getFullYear());
  const [calMonth,setCalMonth]=useState(now.getMonth());

  useEffect(()=>{
    (async()=>{
      try{ const r=await window.storage.get(STORAGE_KEY); if(r?.value) setTrades(JSON.parse(r.value)); }catch(e){}
      setLoaded(true);
    })();
  },[]);

  useEffect(()=>{
    if(!loaded) return;
    window.storage.set(STORAGE_KEY,JSON.stringify(trades)).catch(()=>{});
  },[trades,loaded]);

  const stats=useMemo(()=>{
    const closed=trades.filter(t=>t.pnl!==""&&t.pnl!==null&&t.pnl!==undefined);
    if(!closed.length) return {total:0,wins:0,losses:0,winRate:"0.0",totalPnl:"0.00",bestTrade:0,worstTrade:0,profitFactor:"—",avgR:"—",totalR:"—",expectancy:"—"};
    const wins=closed.filter(t=>parseFloat(t.pnl)>0);
    const losses=closed.filter(t=>parseFloat(t.pnl)<0);
    const totalPnl=closed.reduce((s,t)=>s+parseFloat(t.pnl||0),0);
    const grossWin=wins.reduce((s,t)=>s+parseFloat(t.pnl),0);
    const grossLoss=Math.abs(losses.reduce((s,t)=>s+parseFloat(t.pnl),0));
    const rMs=closed.filter(t=>t.rMultiple!==""&&t.rMultiple!==undefined&&!isNaN(parseFloat(t.rMultiple))).map(t=>parseFloat(t.rMultiple));
    const totalR=rMs.reduce((a,b)=>a+b,0);
    const avgR=rMs.length?totalR/rMs.length:null;
    const wr=wins.length/closed.length;
    const winRs=rMs.filter(r=>r>0), lossRs=rMs.filter(r=>r<0);
    const avgWinR=winRs.length?winRs.reduce((a,b)=>a+b,0)/winRs.length:null;
    const avgLossR=lossRs.length?Math.abs(lossRs.reduce((a,b)=>a+b,0)/lossRs.length):null;
    const expectancy=(avgWinR&&avgLossR)?(wr*avgWinR-(1-wr)*avgLossR):null;
    return {
      total:closed.length, wins:wins.length, losses:losses.length,
      winRate:(wr*100).toFixed(1),
      totalPnl:totalPnl.toFixed(2),
      bestTrade:wins.length?Math.max(...wins.map(t=>parseFloat(t.pnl))).toFixed(2):0,
      worstTrade:losses.length?Math.min(...losses.map(t=>parseFloat(t.pnl))).toFixed(2):0,
      profitFactor:grossLoss?(grossWin/grossLoss).toFixed(2):grossWin?"∞":"—",
      avgR:avgR!==null?avgR.toFixed(2):"—",
      totalR:rMs.length?totalR.toFixed(2):"—",
      expectancy:expectancy!==null?expectancy.toFixed(2)+"R":"—",
    };
  },[trades]);

  const equityCurve=useMemo(()=>{
    let eq=0;
    return trades.filter(t=>t.pnl!==""&&t.pnl!==undefined)
      .sort((a,b)=>new Date(a.date)-new Date(b.date))
      .map((t,i)=>{ eq+=parseFloat(t.pnl||0); return {i:i+1,equity:eq,pnl:parseFloat(t.pnl)}; });
  },[trades]);

  const filteredTrades=useMemo(()=>
    trades.filter(t=>
      (!filterSymbol||t.symbol.toLowerCase().includes(filterSymbol.toLowerCase()))&&
      (filterDir==="All"||t.direction===filterDir)&&
      (filterResult==="All"||(filterResult==="Win"&&parseFloat(t.pnl)>0)||(filterResult==="Loss"&&parseFloat(t.pnl)<0)||(filterResult==="BE"&&parseFloat(t.pnl)===0))
    ).sort((a,b)=>new Date(b.date)-new Date(a.date))
  ,[trades,filterSymbol,filterDir,filterResult]);

  const handleField=(k,v)=>{
    const u={...form,[k]:v};
    if(["entry","stopLoss","takeProfit"].includes(k)) u.rr=calcRR(u.entry,u.stopLoss,u.takeProfit);
    if(["entry","stopLoss","exitPrice","direction"].includes(k)) u.rMultiple=calcRMultiple(u.entry,u.stopLoss,u.exitPrice,u.direction);
    setForm(u);
  };

  const saveTrade=()=>{
    if(!form.symbol||!form.date) return;
    const t={...form};
    if(!t.rMultiple&&t.exitPrice&&t.entry&&t.stopLoss) t.rMultiple=calcRMultiple(t.entry,t.stopLoss,t.exitPrice,t.direction);
    if(editId!==null){ setTrades(ts=>ts.map(x=>x.id===editId?{...t,id:editId}:x)); setEditId(null); }
    else setTrades(ts=>[{...t,id:Date.now()},...ts]);
    setForm(defaultForm); setShowForm(false);
  };

  const deleteTrade=(id)=>{ if(confirm("Delete this trade?")) setTrades(ts=>ts.filter(t=>t.id!==id)); };
  const editTrade=(t)=>{ setForm({...defaultForm,...t}); setEditId(t.id); setShowForm(true); setView("trades"); };
  const pnlColor=(v)=>parseFloat(v)>0?"#22a355":parseFloat(v)<0?"#d13030":"var(--color-text-secondary)";
  const rColor=(v)=>parseFloat(v)>0?"#22a355":parseFloat(v)<0?"#d13030":"var(--color-text-secondary)";
  const fmtR=(v)=>v!==""&&v!==undefined&&!isNaN(parseFloat(v))?(parseFloat(v)>0?"+":"")+parseFloat(v).toFixed(2)+"R":null;

  const iStyle={width:"100%",boxSizing:"border-box"};
  const lStyle={fontSize:12,color:"var(--color-text-secondary)",marginBottom:4,display:"block"};
  const fg=(label,children)=><div style={{marginBottom:14}}><label style={lStyle}>{label}</label>{children}</div>;

  const maxEq=equityCurve.length?Math.max(...equityCurve.map(p=>p.equity),0):1;
  const minEq=equityCurve.length?Math.min(...equityCurve.map(p=>p.equity),0):0;
  const eRange=maxEq-minEq||1;
  const cH=120,cW=560,pX=46,pY=10;
  const toX=(i)=>pX+((i-1)/Math.max(equityCurve.length-1,1))*(cW-pX-10);
  const toY=(eq)=>pY+cH-((eq-minEq)/eRange)*cH;

  const navItems=[
    {id:"dashboard",icon:"📊",label:"Dashboard"},
    {id:"trades",icon:"📋",label:"Trades"},
    {id:"analytics",icon:"📈",label:"Analytics"},
    {id:"calendar",icon:"📅",label:"Calendar"},
  ];

  if(!loaded) return <div style={{padding:"40px",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>Loading…</div>;

  return (
    <div style={{fontFamily:"system-ui, -apple-system, sans-serif",color:"var(--color-text-primary)",maxWidth:880,margin:"0 auto",padding:"0 0 48px"}}>
      <style>{`
        :root {
          --color-background-primary: #ffffff;
          --color-background-secondary: #f5f5f7;
          --color-text-primary: #1a1a1e;
          --color-text-secondary: #5e5e6a;
          --color-text-tertiary: #8e8e98;
          --color-border-primary: #2c2c30;
          --color-border-tertiary: #e2e2e6;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --color-background-primary: #0d0d0f;
            --color-background-secondary: #1c1c1f;
            --color-text-primary: #f5f5f7;
            --color-text-secondary: #a0a0ab;
            --color-text-tertiary: #6c6c78;
            --color-border-tertiary: #2c2c30;
          }
        }
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; font-size: 13px; border-radius: 8px; border: 0.5px solid var(--color-border-tertiary); background: var(--color-background-primary); padding: 8px 10px; color: var(--color-text-primary); }
        button { cursor: pointer; }
      `}</style>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:20,gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:22}}>📈</span>
          <span style={{fontWeight:700,fontSize:16,letterSpacing:"-0.02em"}}>TradeLog</span>
        </div>
        <nav style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {navItems.map(({id,icon,label})=>(
            <button key={id} onClick={()=>setView(id)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:20,fontSize:12,border:view===id?"1.5px solid var(--color-border-primary)":"0.5px solid var(--color-border-tertiary)",background:view===id?"var(--color-background-secondary)":"transparent",cursor:"pointer",fontWeight:view===id?500:400,color:"var(--color-text-primary)"}}>
              <span style={{fontSize:13}}>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>exportCSV(trades)}
            style={{display:"flex",alignItems:"center",gap:5,padding:"6px 13px",borderRadius:20,border:"0.5px solid var(--color-border-tertiary)",background:"transparent",cursor:"pointer",fontSize:12,color:"var(--color-text-secondary)"}}>
            💾 Export CSV
          </button>
          <button onClick={()=>{setForm(defaultForm);setEditId(null);setShowForm(!showForm);setView("trades");}}
            style={{display:"flex",alignItems:"center",gap:5,padding:"6px 16px",borderRadius:20,background:"#22a355",color:"#fff",border:"none",cursor:"pointer",fontWeight:500,fontSize:12}}>
            ➕ Log Trade
          </button>
        </div>
      </div>

      {view==="dashboard"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(108px,1fr))",gap:8,marginBottom:18}}>
            <StatCard label="Total P&L" value={`${parseFloat(stats.totalPnl)>=0?"+":""}$${stats.totalPnl}`} color={parseFloat(stats.totalPnl)>=0?"#22a355":"#d13030"}/>
            <StatCard label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.wins}W / ${stats.losses}L`}/>
            <StatCard label="Trades" value={stats.total}/>
            <StatCard label="Profit Factor" value={stats.profitFactor}/>
            <StatCard label="Total R" value={stats.totalR==="—"?stats.totalR:`${parseFloat(stats.totalR)>=0?"+":""}${stats.totalR}R`} color={stats.totalR!=="—"?(parseFloat(stats.totalR)>=0?"#22a355":"#d13030"):undefined}/>
            <StatCard label="Avg R" value={stats.avgR==="—"?stats.avgR:`${parseFloat(stats.avgR)>=0?"+":""}${stats.avgR}R`} color={stats.avgR!=="—"?(parseFloat(stats.avgR)>=0?"#22a355":"#d13030"):undefined}/>
            <StatCard label="Expectancy" value={stats.expectancy}/>
            <StatCard label="Best Trade" value={`+$${stats.bestTrade}`} color="#22a355"/>
            <StatCard label="Worst Trade" value={`$${stats.worstTrade}`} color="#d13030"/>
          </div>

          {equityCurve.length>1&&(
            <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 18px",marginBottom:14}}>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:8,fontWeight:500}}>Equity curve</div>
              <svg viewBox={`0 0 ${cW} ${cH+pY*2+12}`} width="100%" style={{display:"block"}}>
                <line x1={pX} y1={pY} x2={pX} y2={cH+pY} stroke="var(--color-border-tertiary)" strokeWidth="0.5"/>
                <line x1={pX} y1={cH+pY} x2={cW-8} y2={cH+pY} stroke="var(--color-border-tertiary)" strokeWidth="0.5"/>
                {minEq<0&&maxEq>0&&<line x1={pX} y1={toY(0)} x2={cW-8} y2={toY(0)} stroke="var(--color-border-tertiary)" strokeWidth="0.5" strokeDasharray="3 3"/>}
                <text x={pX-4} y={pY+5} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end">${maxEq.toFixed(0)}</text>
                <text x={pX-4} y={cH+pY+2} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end">${minEq.toFixed(0)}</text>
                <polyline points={equityCurve.map(p=>`${toX(p.i)},${toY(p.equity)}`).join(" ")} fill="none" stroke="#22a355" strokeWidth="1.5" strokeLinejoin="round"/>
                {equityCurve.map((p,i)=><circle key={i} cx={toX(p.i)} cy={toY(p.equity)} r="2.5" fill={p.pnl>=0?"#22a355":"#d13030"}/>)}
              </svg>
            </div>
          )}

          <div style={{fontSize:11,color:"var(--color-text-secondary)",fontWeight:500,marginBottom:8}}>Recent trades</div>
          {!trades.length&&<div style={{textAlign:"center",padding:"30px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No trades yet — click "Log Trade" to start.</div>}
          {trades.slice(0,6).map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",marginBottom:5,background:"var(--color-background-primary)"}}>
              <Badge text={t.direction} color={t.direction==="Long"?"blue":"amber"}/>
              <span style={{fontWeight:500,minWidth:64,fontSize:13}}>{t.symbol}</span>
              <span style={{fontSize:11,color:"var(--color-text-secondary)",flex:1}}>{t.setup||t.instrument}</span>
              {fmtR(t.rMultiple)&&<span style={{fontSize:11,fontWeight:600,color:rColor(t.rMultiple)}}>{fmtR(t.rMultiple)}</span>}
              <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{t.date}</span>
              <span style={{fontWeight:600,fontSize:13,color:pnlColor(t.pnl),minWidth:68,textAlign:"right"}}>
                {t.pnl!==""?(parseFloat(t.pnl)>=0?"+":"")+"$"+parseFloat(t.pnl).toFixed(2):"Open"}
              </span>
            </div>
          ))}
        </div>
      )}

      {view==="trades"&&(
        <div>
          {showForm&&(
            <div style={{background:"var(--color-background-secondary)",borderRadius:14,padding:"18px 20px",marginBottom:20,border:"0.5px solid var(--color-border-tertiary)"}}>
              <div style={{fontWeight:500,marginBottom:16,fontSize:14}}>{editId?"Edit trade":"Log new trade"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                {fg("Date",<input type="date" style={iStyle} value={form.date} onChange={e=>handleField("date",e.target.value)}/>)}
                {fg("Symbol / Pair",<input type="text" style={iStyle} placeholder="e.g. EURUSD" value={form.symbol} onChange={e=>handleField("symbol",e.target.value.toUpperCase())}/>)}
                {fg("Instrument",<select style={iStyle} value={form.instrument} onChange={e=>handleField("instrument",e.target.value)}>{INSTRUMENTS.map(i=><option key={i}>{i}</option>)}</select>)}
                {fg("Direction",(
                  <div style={{display:"flex",gap:6}}>
                    {["Long","Short"].map(d=>(
                      <button key={d} onClick={()=>handleField("direction",d)}
                        style={{flex:1,padding:"5px 0",borderRadius:7,border:form.direction===d?"1.5px solid "+(d==="Long"?"#22a355":"#d13030"):"0.5px solid var(--color-border-tertiary)",background:form.direction===d?(d==="Long"?"#e6f7ed":"#fde4e4"):"transparent",cursor:"pointer",fontWeight:form.direction===d?600:400,color:form.direction===d?(d==="Long"?"#1a6641":"#a02020"):"var(--color-text-secondary)",fontSize:12}}>
                        {d==="Long"?"↑ Long":"↓ Short"}
                      </button>
                    ))}
                  </div>
                ))}
                {fg("Session",<select style={iStyle} value={form.session} onChange={e=>handleField("session",e.target.value)}>{SESSIONS.map(s=><option key={s}>{s}</option>)}</select>)}
                {fg("Setup",<select style={iStyle} value={form.setup} onChange={e=>handleField("setup",e.target.value)}><option value="">Select setup</option>{SETUPS.map(s=><option key={s}>{s}</option>)}</select>)}
                {fg("Entry Price",<input type="number" step="any" style={iStyle} placeholder="0.00" value={form.entry} onChange={e=>handleField("entry",e.target.value)}/>)}
                {fg("Stop Loss",<input type="number" step="any" style={iStyle} placeholder="0.00" value={form.stopLoss} onChange={e=>handleField("stopLoss",e.target.value)}/>)}
                {fg("Take Profit",<input type="number" step="any" style={iStyle} placeholder="0.00" value={form.takeProfit} onChange={e=>handleField("takeProfit",e.target.value)}/>)}
                {fg("Exit Price",<input type="number" step="any" style={iStyle} placeholder="0.00" value={form.exitPrice} onChange={e=>handleField("exitPrice",e.target.value)}/>)}
                {fg("Position Size",<input type="number" step="any" style={iStyle} placeholder="Lots / Units" value={form.size} onChange={e=>handleField("size",e.target.value)}/>)}
                {fg("P&L ($)",<input type="number" step="any" style={iStyle} placeholder="e.g. 250.00" value={form.pnl} onChange={e=>handleField("pnl",e.target.value)}/>)}
                {fg("R:R (auto)",<div style={{padding:"6px 10px",borderRadius:7,border:"0.5px solid var(--color-border-tertiary)",fontSize:13,color:"var(--color-text-secondary)",background:"var(--color-background-primary)"}}>{form.rr||"—"}</div>)}
                {fg("R-Multiple (auto or override)",(
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{flex:1,padding:"6px 10px",borderRadius:7,border:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:600,color:form.rMultiple?rColor(form.rMultiple):"var(--color-text-secondary)",background:"var(--color-background-primary)"}}>
                      {fmtR(form.rMultiple)||"Auto"}
                    </div>
                    <input type="number" step="any" style={{width:90,flexShrink:0}} placeholder="Override" value={form.rMultiple} onChange={e=>setForm(f=>({...f,rMultiple:e.target.value}))}/>
                  </div>
                ))}
                {fg("Account Risk %",<input type="number" step="any" style={iStyle} placeholder="e.g. 1.0" value={form.accountRisk} onChange={e=>handleField("accountRisk",e.target.value)}/>)}
                {fg("Duration",<input type="text" style={iStyle} placeholder="e.g. 2h 30m" value={form.duration} onChange={e=>handleField("duration",e.target.value)}/>)}
                {fg("Pre-trade Emotion",<select style={iStyle} value={form.emotion} onChange={e=>handleField("emotion",e.target.value)}>{EMOTIONS.map(e=><option key={e}>{e}</option>)}</select>)}
              </div>
              <div style={{marginBottom:12}}>
                <label style={lStyle}>Discipline score (1–10)</label>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <input type="range" min="1" max="10" step="1" value={form.discipline} onChange={e=>handleField("discipline",parseInt(e.target.value))} style={{flex:1}}/>
                  <span style={{fontWeight:500,minWidth:24,fontSize:13}}>{form.discipline}/10</span>
                </div>
              </div>
              <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" id="fp" checked={form.followedPlan} onChange={e=>handleField("followedPlan",e.target.checked)}/>
                <label htmlFor="fp" style={{fontSize:12,color:"var(--color-text-secondary)"}}>Followed my trading plan</label>
              </div>
              <div style={{marginBottom:12}}>
                <label style={lStyle}>Tags (comma-separated)</label>
                <input type="text" style={iStyle} placeholder="e.g. revenge-trade, FOMO, missed-target" value={form.tags} onChange={e=>handleField("tags",e.target.value)}/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={lStyle}>Notes / Lessons learned</label>
                <textarea style={{...iStyle,height:72,resize:"vertical"}} placeholder="What did you observe? What could be improved?" value={form.notes} onChange={e=>handleField("notes",e.target.value)}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={lStyle}>Screenshot URL</label>
                <input type="text" style={iStyle} placeholder="https://..." value={form.screenshot} onChange={e=>handleField("screenshot",e.target.value)}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveTrade} style={{padding:"7px 22px",borderRadius:8,background:"#22a355",color:"#fff",border:"none",cursor:"pointer",fontWeight:500,fontSize:13}}>
                  {editId?"Update trade":"Save trade"}
                </button>
                <button onClick={()=>{setShowForm(false);setEditId(null);setForm(defaultForm);}} style={{padding:"7px 16px",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)",background:"transparent",cursor:"pointer",fontSize:13,color:"var(--color-text-secondary)"}}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <input type="text" placeholder="Search symbol…" value={filterSymbol} onChange={e=>setFilterSymbol(e.target.value)} style={{width:150}}/>
            {["All","Long","Short"].map(d=>(
              <button key={d} onClick={()=>setFilterDir(d)} style={{padding:"4px 11px",borderRadius:20,fontSize:11,border:filterDir===d?"1.5px solid var(--color-border-primary)":"0.5px solid var(--color-border-tertiary)",background:filterDir===d?"var(--color-background-secondary)":"transparent",cursor:"pointer",color:"var(--color-text-primary)"}}>{d}</button>
            ))}
            {["All","Win","Loss","BE"].map(r=>(
              <button key={r} onClick={()=>setFilterResult(r)} style={{padding:"4px 11px",borderRadius:20,fontSize:11,border:filterResult===r?"1.5px solid var(--color-border-primary)":"0.5px solid var(--color-border-tertiary)",background:filterResult===r?"var(--color-background-secondary)":"transparent",cursor:"pointer",color:"var(--color-text-primary)"}}>{r}</button>
            ))}
            <span style={{fontSize:11,color:"var(--color-text-tertiary)",marginLeft:"auto"}}>{filteredTrades.length} trade{filteredTrades.length!==1?"s":""}</span>
          </div>

          {!filteredTrades.length&&<div style={{textAlign:"center",padding:"30px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No trades match your filters.</div>}
          {filteredTrades.map(t=>(
            <div key={t.id} style={{border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"11px 14px",marginBottom:7,background:"var(--color-background-primary)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <Badge text={t.direction} color={t.direction==="Long"?"blue":"amber"}/>
                <span style={{fontWeight:600,fontSize:14}}>{t.symbol}</span>
                <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{t.instrument}</span>
                {t.setup&&<Badge text={t.setup} color="gray"/>}
                {!t.followedPlan&&<Badge text="Off-plan" color="red"/>}
                {fmtR(t.rMultiple)&&<Badge text={fmtR(t.rMultiple)} color={parseFloat(t.rMultiple)>=0?"green":"red"}/>}
                <span style={{fontSize:11,color:"var(--color-text-tertiary)",marginLeft:"auto"}}>{t.date}</span>
                <span style={{fontWeight:700,fontSize:14,color:pnlColor(t.pnl),minWidth:72,textAlign:"right"}}>
                  {t.pnl!==""?(parseFloat(t.pnl)>=0?"+":"")+"$"+parseFloat(t.pnl).toFixed(2):"Open"}
                </span>
                <button onClick={()=>setDetailId(detailId===t.id?null:t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:14,padding:"2px"}}>▼</button>
                <button onClick={()=>editTrade(t)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:14,padding:"2px"}}>✏️</button>
                <button onClick={()=>deleteTrade(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#d13030",fontSize:14,padding:"2px"}}>🗑️</button>
              </div>
              {detailId===t.id&&(
                <div style={{marginTop:12,paddingTop:10,borderTop:"0.5px solid var(--color-border-tertiary)"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(95px,1fr))",gap:8,marginBottom:10}}>
                    {[["Entry",t.entry],["Stop Loss",t.stopLoss],["Take Profit",t.takeProfit],["Exit",t.exitPrice],["Size",t.size],["R:R",t.rr||"—"],["R-Multiple",fmtR(t.rMultiple)||"—"],["Acct Risk",t.accountRisk?t.accountRisk+"%":"—"],["Duration",t.duration||"—"],["Session",t.session],["Emotion",t.emotion],["Discipline",t.discipline+"/10"]].map(([l,v])=>(
                      <div key={l} style={{fontSize:11}}>
                        <div style={{color:"var(--color-text-tertiary)",marginBottom:2}}>{l}</div>
                        <div style={{fontWeight:500,color:l==="R-Multiple"&&v!=="—"?rColor(v):undefined}}>{v||"—"}</div>
                      </div>
                    ))}
                  </div>
                  {t.tags&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>{t.tags.split(",").map(tag=><Badge key={tag} text={tag.trim()} color="gray"/>)}</div>}
                  {t.notes&&<div style={{fontSize:12,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:7,padding:"8px 11px",marginBottom:8}}>{t.notes}</div>}
                  {t.screenshot&&<a href={t.screenshot} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#0066cc",display:"inline-flex",alignItems:"center",gap:4}}>🔗 View screenshot</a>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {view==="analytics"&&(
        <div>
          <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 18px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)"}}>R-multiple per trade</div>
              <div style={{display:"flex",gap:16,fontSize:10,color:"var(--color-text-tertiary)"}}>
                <span>Total: <b style={{color:stats.totalR!=="—"?(parseFloat(stats.totalR)>=0?"#22a355":"#d13030"):undefined}}>{stats.totalR==="—"?stats.totalR:(parseFloat(stats.totalR)>=0?"+":"")+stats.totalR+"R"}</b></span>
                <span>Avg: <b style={{color:stats.avgR!=="—"?(parseFloat(stats.avgR)>=0?"#22a355":"#d13030"):undefined}}>{stats.avgR==="—"?stats.avgR:(parseFloat(stats.avgR)>=0?"+":"")+stats.avgR+"R"}</b></span>
                <span>Expectancy: <b>{stats.expectancy}</b></span>
              </div>
            </div>
            <RMultipleChart trades={trades}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:10}}>P&L by instrument</div>
              {Object.entries(trades.reduce((acc,t)=>{if(t.pnl==="")return acc;acc[t.instrument]=(acc[t.instrument]||0)+parseFloat(t.pnl||0);return acc;},{}))
                .sort((a,b)=>b[1]-a[1]).map(([inst,pnl])=>(
                <div key={inst} style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:12}}>
                  <span style={{color:"var(--color-text-secondary)"}}>{inst}</span>
                  <span style={{fontWeight:600,color:pnlColor(pnl)}}>{pnl>=0?"+":""}${pnl.toFixed(2)}</span>
                </div>
              ))}
              {!trades.filter(t=>t.pnl!=="").length&&<div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>No data yet</div>}
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:10}}>P&L by emotion</div>
              {Object.entries(trades.reduce((acc,t)=>{if(t.pnl==="")return acc;if(!acc[t.emotion])acc[t.emotion]={pnl:0,count:0};acc[t.emotion].pnl+=parseFloat(t.pnl||0);acc[t.emotion].count++;return acc;},{}))
                .sort((a,b)=>b[1].pnl-a[1].pnl).map(([emo,{pnl,count}])=>(
                <div key={emo} style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:12}}>
                  <span style={{color:"var(--color-text-secondary)"}}>{emo} <span style={{fontSize:10,color:"var(--color-text-tertiary)"}}>({count})</span></span>
                  <span style={{fontWeight:600,color:pnlColor(pnl)}}>{pnl>=0?"+":""}${pnl.toFixed(2)}</span>
                </div>
              ))}
              {!trades.filter(t=>t.pnl!=="").length&&<div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>No data yet</div>}
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:10}}>Win rate & avg R by setup</div>
              {Object.entries(trades.reduce((acc,t)=>{
                if(!t.setup||t.pnl==="")return acc;
                if(!acc[t.setup])acc[t.setup]={wins:0,total:0,rMs:[]};
                acc[t.setup].total++;
                if(parseFloat(t.pnl)>0)acc[t.setup].wins++;
                if(t.rMultiple!==""&&!isNaN(parseFloat(t.rMultiple)))acc[t.setup].rMs.push(parseFloat(t.rMultiple));
                return acc;
              },{})).sort((a,b)=>(b[1].wins/b[1].total)-(a[1].wins/a[1].total)).map(([setup,{wins,total,rMs}])=>{
                const wr=((wins/total)*100).toFixed(0);
                const avgR=rMs.length?(rMs.reduce((a,b)=>a+b,0)/rMs.length).toFixed(2):null;
                return (
                  <div key={setup} style={{marginBottom:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                      <span style={{color:"var(--color-text-secondary)"}}>{setup}</span>
                      <div style={{display:"flex",gap:8}}>
                        {avgR&&<span style={{fontWeight:500,color:parseFloat(avgR)>=0?"#22a355":"#d13030",fontSize:10}}>{parseFloat(avgR)>=0?"+":""}{avgR}R</span>}
                        <span style={{fontWeight:500}}>{wr}% ({wins}/{total})</span>
                      </div>
                    </div>
                    <div style={{height:3,borderRadius:2,background:"var(--color-border-tertiary)",overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${(wins/total)*100}%`,background:"#22a355",borderRadius:2}}/>
                    </div>
                  </div>
                );
              })}
              {!trades.filter(t=>t.setup&&t.pnl!=="").length&&<div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>No data yet</div>}
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:10}}>Plan adherence impact</div>
              {(()=>{
                const on=trades.filter(t=>t.followedPlan&&t.pnl!=="");
                const off=trades.filter(t=>!t.followedPlan&&t.pnl!=="");
                return (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[[on,"On-plan","#22a355"],[off,"Off-plan","#d13030"]].map(([set,label,color])=>{
                      const wr=set.length?((set.filter(t=>parseFloat(t.pnl)>0).length/set.length)*100).toFixed(0):"—";
                      const rMs=set.filter(t=>t.rMultiple!==""&&!isNaN(parseFloat(t.rMultiple))).map(t=>parseFloat(t.rMultiple));
                      const avgR=rMs.length?(rMs.reduce((a,b)=>a+b,0)/rMs.length).toFixed(2):"—";
                      return (
                        <div key={label} style={{background:"var(--color-background-primary)",borderRadius:8,padding:"10px 12px",border:"0.5px solid var(--color-border-tertiary)"}}>
                          <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginBottom:4}}>{label} ({set.length})</div>
                          <div style={{fontWeight:700,color,fontSize:18}}>{wr}{wr!=="—"?"%":""}</div>
                          <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>win rate</div>
                          <div style={{fontWeight:600,color:avgR!=="—"?(parseFloat(avgR)>=0?"#22a355":"#d13030"):undefined,fontSize:13,marginTop:6}}>
                            {avgR!=="—"?(parseFloat(avgR)>=0?"+":"")+avgR+"R":avgR}
                          </div>
                          <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>avg R</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:10}}>Monthly performance</div>
            {!trades.filter(t=>t.pnl!=="").length&&<div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>No data yet</div>}
            {Object.entries(trades.reduce((acc,t)=>{
              if(t.pnl==="")return acc;
              const m=t.date.slice(0,7);
              if(!acc[m])acc[m]={pnl:0,trades:0,wins:0,rMs:[]};
              acc[m].pnl+=parseFloat(t.pnl||0);
              acc[m].trades++;
              if(parseFloat(t.pnl)>0)acc[m].wins++;
              if(t.rMultiple!==""&&!isNaN(parseFloat(t.rMultiple)))acc[m].rMs.push(parseFloat(t.rMultiple));
              return acc;
            },{})).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,data])=>{
              const totalR=data.rMs.length?data.rMs.reduce((a,b)=>a+b,0):null;
              return (
                <div key={month} style={{display:"flex",alignItems:"center",gap:12,padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12}}>
                  <span style={{color:"var(--color-text-secondary)",minWidth:68}}>{month}</span>
                  <span style={{color:"var(--color-text-tertiary)",fontSize:11}}>{data.trades} trades</span>
                  <span style={{color:"var(--color-text-tertiary)",fontSize:11}}>{((data.wins/data.trades)*100).toFixed(0)}% WR</span>
                  {totalR!==null&&<span style={{fontSize:11,fontWeight:600,color:totalR>=0?"#22a355":"#d13030"}}>{totalR>=0?"+":""}{totalR.toFixed(2)}R</span>}
                  <span style={{fontWeight:700,color:pnlColor(data.pnl),marginLeft:"auto"}}>{data.pnl>=0?"+":""}${data.pnl.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view==="calendar"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{background:"none",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"4px 11px",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:14}}>◀</button>
            <span style={{fontWeight:600,fontSize:15,minWidth:150,textAlign:"center"}}>{MONTHS[calMonth]} {calYear}</span>
            <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{background:"none",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"4px 11px",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:14}}>▶</button>
            <button onClick={()=>{setCalYear(now.getFullYear());setCalMonth(now.getMonth());}} style={{fontSize:11,color:"var(--color-text-tertiary)",background:"none",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>Today</button>
          </div>

          <div style={{background:"var(--color-background-secondary)",borderRadius:14,padding:"18px 20px",marginBottom:14}}>
            <CalendarHeatmap trades={trades} year={calYear} month={calMonth}/>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:14,fontSize:10,color:"var(--color-text-tertiary)",marginBottom:18,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:12,height:12,borderRadius:3,background:"rgba(34,163,85,0.85)"}}/>Profitable day
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:12,height:12,borderRadius:3,background:"rgba(209,48,48,0.85)"}}/>Loss day
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:12,height:12,borderRadius:3,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}/>No trades
            </div>
            <span>Deeper color = larger absolute P&L</span>
          </div>

          {(()=>{
            const mt=trades.filter(t=>{const d=new Date(t.date+"T12:00:00");return d.getFullYear()===calYear&&d.getMonth()===calMonth&&t.pnl!==""});
            if(!mt.length) return <div style={{textAlign:"center",padding:"20px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No trades logged this month.</div>;
            const wins=mt.filter(t=>parseFloat(t.pnl)>0);
            const totalPnl=mt.reduce((s,t)=>s+parseFloat(t.pnl),0);
            const rMs=mt.filter(t=>t.rMultiple!==""&&!isNaN(parseFloat(t.rMultiple))).map(t=>parseFloat(t.rMultiple));
            const totalR=rMs.reduce((a,b)=>a+b,0);
            const tradingDays=new Set(mt.map(t=>t.date)).size;
            return (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(108px,1fr))",gap:8}}>
                <StatCard label={MONTHS[calMonth]+" P&L"} value={`${totalPnl>=0?"+":""}$${totalPnl.toFixed(2)}`} color={totalPnl>=0?"#22a355":"#d13030"} small/>
                <StatCard label="Trades" value={mt.length} sub={`${tradingDays} day${tradingDays!==1?"s":""}`} small/>
                <StatCard label="Win Rate" value={`${((wins.length/mt.length)*100).toFixed(0)}%`} sub={`${wins.length}W / ${mt.length-wins.length}L`} small/>
                {rMs.length>0&&<StatCard label="Total R" value={`${totalR>=0?"+":""}${totalR.toFixed(2)}R`} color={totalR>=0?"#22a355":"#d13030"} small/>}
                {rMs.length>0&&<StatCard label="Avg R" value={`${(totalR/rMs.length)>=0?"+":""}${(totalR/rMs.length).toFixed(2)}R`} color={(totalR/rMs.length)>=0?"#22a355":"#d13030"} small/>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}