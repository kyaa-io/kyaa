import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CognitoNativeFinish } from "../../../../../features/auth/client/cognito-native-finish";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default function Page(){if(process.env.AUTH_PROVIDER!=="cognito")notFound();return <Suspense fallback={null}><CognitoNativeFinish/></Suspense>;}
