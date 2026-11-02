import {Children,Fragment,isValidElement,type CSSProperties,type ReactNode} from 'react';
import data from './source-panel-properties.json';
import {sourcePanelExtras} from './source-panel-extras';
import './source-panel-properties.css';
type Action={id:string;text:string;style:CSSProperties;labelStyle:CSSProperties};
type Panel={title:string;actions:Record<string,Action>;actionCount:number;actionOrder:string[];texts:Record<string,{text:string;style:CSSProperties}>;fields:{name:string;label:string;style:CSSProperties;labelStyle:CSSProperties}[];containers:Record<string,CSSProperties>};
const panels=data as unknown as Record<string,Panel>;
export function sourcePanelTitle(id:string,fallback:string){return panels[id]?.title??fallback;}
export function sourcePanelText(id:string,text:string){return panels[id]?.texts[text]?.text??text;}
export function sourcePanelTextStyle(id:string,text:string){return panels[id]?.texts[text]?.style;}
export function sourcePanelActionClass(id:string,label:string){const action=panels[id]?.actions[label];return action?'sourcePanelAction-'+action.id:'';}
export function sourcePanelActionText(id:string,label:string){return panels[id]?.actions[label]?.text??label;}
export function sourcePanelActionExists(id:string,label:string){return !panels[id]||Boolean(panels[id].actions[label]);}
export function sourcePanelHasActions(id:string){return !panels[id]||panels[id].actionCount>0;}
export function sourcePanelField(id:string,label:string,index?:number){return panels[id]?.fields.find(field=>field.name===label||field.label===label)??(index!==undefined?panels[id]?.fields[index]:undefined);}
export function sourcePanelContainerStyle(id:string,name:string){return panels[id]?.containers[name];}
export function SourcePanelExtra({id}:{id:string}){const Extra=(sourcePanelExtras as Record<string,()=>React.ReactNode>)[id];return Extra?<Extra/>:null;}

export function sourcePanelOrder(id:string,children:ReactNode):ReactNode[]{const order=panels[id]?.actionOrder;if(!order)return Children.toArray(children);const flatten=(nodes:ReactNode):ReactNode[]=>Children.toArray(nodes).flatMap(node=>isValidElement<{children?:ReactNode}>(node)&&node.type===Fragment?flatten(node.props.children):[node]);const index=(node:ReactNode)=>{if(!isValidElement<{className?:string}>(node))return order.length;const match=node.props.className?.match(/sourcePanelAction-([a-z0-9]+)/i);const found=match?order.indexOf(match[1]):-1;return found<0?order.length:found;};return flatten(children).sort((a,b)=>index(a)-index(b));}
