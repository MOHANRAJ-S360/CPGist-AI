"use client";

import {ReactNode,useEffect,useState} from "react";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {LayoutDashboard,BrainCircuit,Boxes,Store,Layers3,Globe2,Map,FileText,Workflow,TriangleAlert,Database,LogOut,ChevronRight,Search,DollarSign,BarChart3,FlaskConical,Target,Users,Megaphone,PackageCheck,Menu,X} from "lucide-react";
import {supabaseBrowser} from "../lib/supabase-browser";

const nav=[
 {label:"Dashboard",href:"/dashboard",icon:LayoutDashboard},
 {label:"AI Analyst",href:"/ai-analyst",icon:BrainCircuit},
 {label:"Brands",href:"/brands",icon:Boxes},
 {label:"First Purchase Share",href:"/first-purchase-share",icon:Users},
 {label:"Retailers",href:"/retailers",icon:Store},
 {label:"Categories",href:"/categories",icon:Layers3},
 {label:"Regions",href:"/regions",icon:Map},
 {label:"Availability Coverage",href:"/availability-coverage",icon:PackageCheck},
 {label:"Market",href:"/market",icon:Globe2},
 {label:"Data Explorer",href:"/explorer",icon:Search},
 {label:"Reports",href:"/reports",icon:FileText},
 {label:"Price & Promotion",href:"/price-promotion",icon:DollarSign},
 {label:"Media Readiness",href:"/media-readiness",icon:Megaphone},
 {label:"Advanced Analytics",href:"/advanced-analytics",icon:BarChart3},
 {label:"Distribution Efficiency",href:"/distribution-efficiency",icon:Target},
 {label:"A/B Testing",href:"/ab-testing",icon:FlaskConical},
 {label:"Workflows",href:"/workflows",icon:Workflow},
 {label:"Alerts",href:"/alerts",icon:TriangleAlert},
 {label:"Data Import",href:"/import",icon:Database}
];

export function AppShell({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}){
 const pathname=usePathname(),router=useRouter();
 const [user,setUser]=useState<any>(null),[signingOut,setSigningOut]=useState(false),[importBusy,setImportBusy]=useState(false),[mobileNavOpen,setMobileNavOpen]=useState(false);
 useEffect(()=>{setMobileNavOpen(false)},[pathname]);
 useEffect(()=>{const onImport=(e:Event)=>setImportBusy(Boolean((e as CustomEvent).detail));window.addEventListener("cpgist:import-busy",onImport);return()=>window.removeEventListener("cpgist:import-busy",onImport)},[]);useEffect(()=>{supabaseBrowser().auth.getUser().then(({data})=>{if(!data.user){router.replace("/");return}setUser(data.user)}).catch(()=>router.replace("/"))},[router]);
 async function logout(){
  if(signingOut||importBusy)return;
  setSigningOut(true);
  const sb=supabaseBrowser();
  try{
    // CPGist dataset is a temporary workspace. Remove the imported dataset
    // before ending the local session so the next signed-in session starts empty.
    const {error}=await sb.rpc("cpgist_reset_import_dataset");
    if(error) console.error("Dataset cleanup before sign out failed:",error);
  }finally{
    await sb.auth.signOut({scope:"local"});
    router.replace("/");
  }
}
 const metadata=user?.user_metadata||{};
 const name=metadata.full_name||metadata.name||user?.email?.split("@")[0]||"User";
 const email=user?.email||"";
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map((x:string)=>x[0]).join("").toUpperCase()||"U";
 return <div className={"app-shell"+(mobileNavOpen?" mobile-nav-open":"")}>
  {mobileNavOpen&&<button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={()=>setMobileNavOpen(false)}/>}
  <aside className="sidebar">
   <div className="brand"><div className="logo">C</div><div><b>CPGist</b><small>CPG INTELLIGENCE</small></div></div>
   <div className="navlabel">WORKSPACE</div>
   <nav className="workspace-nav">{nav.map(({label,href,icon:Icon})=>{const active=pathname===href||pathname.startsWith(href+"/");return <Link key={href} href={href} onClick={()=>setMobileNavOpen(false)} className={"navitem "+(active?"active":"")}><Icon size={16}/><span>{label}</span>{active&&<ChevronRight size={13} className="nav-chevron"/>}</Link>})}</nav>
   <div className="sidebar-user">
    <div className="sidebar-user-main"><div className="avatar">{initials}</div><div className="sidebar-user-copy"><b>{name}</b><small>{email}</small></div></div>
    <button className="signout" onClick={logout} disabled={signingOut||importBusy}><LogOut size={15}/><span>{signingOut?"Signing out…":"Sign out"}</span></button>
   </div>
  </aside>
  <main className="main">
   <header className="topbar"><div className="topbar-heading"><button type="button" className="mobile-nav-toggle" aria-label={mobileNavOpen?"Close navigation":"Open navigation"} aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(v=>!v)}>{mobileNavOpen?<X size={19}/>:<Menu size={19}/>}</button><div><b>{title}</b>{subtitle&&<span>{subtitle}</span>}</div></div><div className="topbar-user"><div className="mini-avatar">{initials}</div><div><strong>{name}</strong><small>{email}</small></div></div></header>
   {children}
  </main>
 </div>
}
