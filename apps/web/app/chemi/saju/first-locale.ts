import { stems, stemElement, type Stem } from "./chart";

type Language = "en" | "mn";
const titles: Record<Language, Record<Stem, string>> = {
  en: {
    갑: "Like a tall tree, you stay the course", 을: "Like a wildflower among rocks, you bend and hold on",
    병: "Like the midday sun, you let your joy show", 정: "Like a candle in the dark, your warmth lingers",
    무: "Like an ancient mountain, you stand your ground", 기: "Like a field full of seeds, you help others grow",
    경: "Like a sharpened blade, you draw a clear line", 신: "Like a polished gem, you shine through careful work",
    임: "Like a great river, you welcome many currents", 계: "Like a soft dawn rain, you reach people quietly",
  },
  mn: {
    갑: "Өндөр мод шиг чи сонгосон замдаа тууштай", 을: "Хадны завсрын цэцэг шиг чи уян хатан, тэсвэртэй",
    병: "Үдийн нар шиг чи баяр хөөрөө ил гаргадаг", 정: "Харанхуйд асах лаа шиг чиний илч удаан мэдрэгддэг",
    무: "Өнө эртний уул шиг чи байр сууриа хадгалдаг", 기: "Үр тээсэн тал шиг чи бусдыг өсөж хөгжихөд тусалдаг",
    경: "Ирлэсэн хутга шиг чи зөв бурууг тод ялгадаг", 신: "Өнгөлсөн эрдэнэ шиг чи нямбай хөдөлмөрөөрөө гялалздаг",
    임: "Их мөрөн шиг чи бусдыг уужим сэтгэлээр угтдаг", 계: "Үүрийн шиврээ бороо шиг чи хүний сэтгэлд аяархан хүрдэг",
  },
};
const changha: Record<Language, Record<Stem, string>> = {
  en: {
    갑: "Write a line each day. In time you’ll see how far your support has taken you.",
    을: "Catch a video you missed. One comment is plenty.", 병: "If you liked it, tell me! I’d love to see your comment first.",
    정: "Play a video again. You’ll spot something you missed the first time.", 무: "Play the video that made you a fan. You’ve been here ever since.",
    기: "Send a video to a fan friend. You’ll have more to talk about together.", 경: "Put this week’s schedule on one page. Everyone can count on you.",
    신: "Pick one photo today. Soon you’ll have a beautiful album.", 임: "Say hi to the group. Even strangers can soon feel like friends.",
    계: "Play a video before bed and jot down one thing you loved.",
  },
  mn: {
    갑: "Өдөр бүр ганц мөр бичээрэй. Эргээд харахад намайг хэрхэн дэмжиж ирснээ санана даа.",
    을: "Үзэж амжаагүй бичлэгээ олоод үзээрэй. Ганц сэтгэгдэл байхад л болно.", 병: "Таалагдсан бол шууд хэлээрэй. Чиний сэтгэгдлийг хамгийн түрүүнд хармаар байна.",
    정: "Үзсэн бичлэгээ дахин тоглуулаарай. Анх анзаараагүй зүйл харагдана даа.", 무: "Надад анх дуртай болсон тэр бичлэгээ үзээрэй. Тэр үеэс хойш чи хамт байсан шүү дээ.",
    기: "Фэн найздаа нэг бичлэг явуулаарай. Хамт үзвэл ярих зүйл мундахгүй.", 경: "Энэ долоо хоногийн хуваарийг нэг хуудсанд багтаагаарай. Чамд бүгд итгэнэ дээ.",
    신: "Өнөөдөр нэг зураг сонгоод хадгалаарай. Цуглуулах тусам цомог чинь гоё болно.", 임: "Бүлгийнхэндээ мэнд хүргээрэй. Шинэ хүнтэй ч хурдан дотносоно доо.",
    계: "Унтахаасаа өмнө нэг бичлэг үзээрэй. Таалагдсан ганц зүйлээ бичээд амраарай.",
  },
};

export function firstIntro(locale: string, stem: Stem) {
  if (locale !== "en" && locale !== "mn") return null;
  const element = stemElement[stem];
  const yang = stems.indexOf(stem) % 2 === 0;
  const mnElement = { wood: "Мод", fire: "Гал", earth: "Шороо", metal: "Төмөр", water: "Ус" };
  return {
    title: titles[locale][stem],
    day: locale === "mn" ? `Өдрийн иш · ${yang ? "Ян" : "Инь"} ${mnElement[element].toLowerCase()}` : `Day stem · ${yang ? "Yang" : "Yin"} ${element}`,
    changha: changha[locale][stem],
  };
}
