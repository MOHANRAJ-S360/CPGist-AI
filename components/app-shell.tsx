"use client";

import {ReactNode,useEffect,useState} from "react";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {LayoutDashboard,BrainCircuit,Boxes,Store,Layers3,Globe2,Map,FileText,Workflow,TriangleAlert,Database,LogOut,ChevronRight,Search,DollarSign,BarChart3} from "lucide-react";
import {supabaseBrowser} from "../lib/supabase-browser";

const nav=[
 {label:"Dashboard",href:"/dashboard",icon:LayoutDashboard},
 {label:"AI Analyst",href:"/ai-analyst",icon:BrainCircuit},
 {label:"Brands",href:"/brands",icon:Boxes},
 {label:"Retailers",href:"/retailers",icon:Store},
 {label:"Categories",href:"/categories",icon:Layers3},
 {label:"Regions",href:"/regions",icon:Map},
 {label:"Market",href:"/market",icon:Globe2},
 {label:"Data Explorer",href:"/explorer",icon:Search},
 {label:"Reports",href:"/reports",icon:FileText},
 {label:"Price & Promotion",href:"/price-promotion",icon:DollarSign},
 {label:"Advanced Analytics",href:"/advanced-analytics",icon:BarChart3},
 {label:"Workflows",href:"/workflows",icon:Workflow},
 {label:"Alerts",href:"/alerts",icon:TriangleAlert},
 {label:"Data Import",href:"/import",icon:Database}
];

export function AppShell({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}){
 const pathname=usePathname(),router=useRouter();
 const [user,setUser]=useState<any>(null),[signingOut,setSigningOut]=useState(false);
 useEffect(()=>{supabaseBrowser().auth.getUser().then(({data})=>{if(!data.user){router.replace("/");return}setUser(data.user)}).catch(()=>router.replace("/"))},[router]);
 async function logout(){if(signingOut)return;setSigningOut(true);await supabaseBrowser().auth.signOut({scope:"local"});router.replace("/")}
 const metadata=user?.user_metadata||{};
 const name=metadata.full_name||metadata.name||user?.email?.split("@")[0]||"User";
 const email=user?.email||"";
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map((x:string)=>x[0]).join("").toUpperCase()||"U";
 return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><div className="logo">C</div><div><b>CPGist</b><small>CPG INTELLIGENCE</small></div></div>
   <div className="navlabel">WORKSPACE</div>
   <nav className="workspace-nav">{nav.map(({label,href,icon:Icon})=>{const active=pathname===href||pathname.startsWith(href+"/");return <Link key={href} href={href} className={"navitem "+(active?"active":"")}><Icon size={16}/><span>{label}</span>{active&&<ChevronRight size={13} className="nav-chevron"/>}</Link>})}</nav>
   <div className="sidebar-user">
    <div className="sidebar-user-main"><div className="avatar">{initials}</div><div className="sidebar-user-copy"><b>{name}</b><small>{email}</small></div></div>
    <button className="signout" onClick={logout} disabled={signingOut}><LogOut size={15}/><span>{signingOut?"Signing out…":"Sign out"}</span></button>
   </div>
  </aside>
  <main className="main">
   <header className="topbar"><div><b>{title}</b>{subtitle&&<span>{subtitle}</span>}</div><div className="topbar-user"><div className="mini-avatar">{initials}</div><div><strong>{name}</strong><small>{email}</small></div></div></header>
   {children}
  </main>
 </div>
}
