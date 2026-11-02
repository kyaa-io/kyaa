// Explicit local fixture metadata. These controls never create a server-side policy contract.
export type GroupManagementPresentation={reportTab?:'posts'|'reports';reports?:Record<string,{title:string;target:string}>;posts?:{id:string;title:string;category:'notice'|'free'}[];boards?:{id:string;name:string;description:string;anonymous:boolean}[]};
