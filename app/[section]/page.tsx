import {notFound} from "next/navigation";
import WorkspaceSection from "../../components/workspace-section";

const allowed=["retailers","categories","regions","market","workflows","alerts"];

export default async function SectionPage({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!allowed.includes(section))notFound();
 return <WorkspaceSection section={section}/>;
}
