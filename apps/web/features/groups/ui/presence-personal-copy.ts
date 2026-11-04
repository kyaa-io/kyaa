import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly[string]>={
 ko:['팬들에게 보이는 모습'],
 en:['What fans see'],
 ja:['ファンへの表示'],
 'zh-Hans':['粉丝看到的样子'],
 'zh-Hant':['粉絲看到的樣子'],
 es:['Lo que ven tus fans'],
 id:['Tampilan bagi penggemar'],
 vi:['Người hâm mộ nhìn thấy'],
 th:['สิ่งที่แฟนเห็น'],
 pt:['O que os fãs veem'],
 fr:['Ce que voient les fans'],
 ru:['Что видят фанаты'],
};
export const presencePersonalCopy=(locale:AppLocale)=>values[locale];
