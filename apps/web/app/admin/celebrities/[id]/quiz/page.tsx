import { quizLearnEnabled } from "@/server/config/feature-flags";
import { QuizManager } from "../../../../../components/admin/quiz-manager";
export default async function Page({params}:{params:Promise<{id:string}>}){return <QuizManager learningEnabled={quizLearnEnabled()} celebrityId={(await params).id}/>}

