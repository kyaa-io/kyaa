import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly string[]>={
 ko:['상품 URL','상품 정보 불러오기','상품 정보를 불러오지 못했어요','상품 정보를 직접 입력해 주세요.','상품명','상품명을 입력하세요','이미지 URL','이미지 URL을 입력하세요','입력한 상품 정보 저장'],
 en:['Product URL','Load product information','Could not load product information','Enter the product information manually.','Product name','Enter the product name','Image URL','Enter the image URL','Save entered product information'],
 ja:['商品URL','商品情報を読み込む','商品情報を読み込めませんでした','商品情報を直接入力してください。','商品名','商品名を入力','画像URL','画像URLを入力','入力した商品情報を保存'],
 'zh-Hans':['商品URL','加载商品信息','无法加载商品信息','请手动输入商品信息。','商品名称','输入商品名称','图片URL','输入图片URL','保存输入的商品信息'],
 'zh-Hant':['商品URL','載入商品資訊','無法載入商品資訊','請手動輸入商品資訊。','商品名稱','輸入商品名稱','圖片URL','輸入圖片URL','儲存輸入的商品資訊'],
 es:['URL del producto','Cargar información del producto','No se pudo cargar la información','Introduce los datos del producto manualmente.','Nombre del producto','Introduce el nombre del producto','URL de la imagen','Introduce la URL de la imagen','Guardar datos introducidos'],
 id:['URL produk','Muat informasi produk','Informasi produk tidak dapat dimuat','Masukkan informasi produk secara manual.','Nama produk','Masukkan nama produk','URL gambar','Masukkan URL gambar','Simpan informasi produk'],
 vi:['URL sản phẩm','Tải thông tin sản phẩm','Không thể tải thông tin sản phẩm','Vui lòng nhập thông tin sản phẩm thủ công.','Tên sản phẩm','Nhập tên sản phẩm','URL hình ảnh','Nhập URL hình ảnh','Lưu thông tin đã nhập'],
 th:['URL สินค้า','โหลดข้อมูลสินค้า','โหลดข้อมูลสินค้าไม่ได้','กรอกข้อมูลสินค้าด้วยตนเอง','ชื่อสินค้า','กรอกชื่อสินค้า','URL รูปภาพ','กรอก URL รูปภาพ','บันทึกข้อมูลสินค้า'],
 pt:['URL do produto','Carregar informações','Não foi possível carregar as informações','Insira as informações do produto manualmente.','Nome do produto','Insira o nome do produto','URL da imagem','Insira a URL da imagem','Salvar informações inseridas'],
 fr:['URL du produit','Charger les informations','Impossible de charger les informations','Saisissez les informations du produit manuellement.','Nom du produit','Saisissez le nom du produit',"URL de l’image","Saisissez l’URL de l’image",'Enregistrer les informations'],
 ru:['URL товара','Загрузить данные товара','Не удалось загрузить данные товара','Введите данные товара вручную.','Название товара','Введите название товара','URL изображения','Введите URL изображения','Сохранить введённые данные']};
export function collectionImportCopy(locale:AppLocale){const c=copy[locale];return{url:c[0],lookup:c[1],failed:c[2],manual:c[3],name:c[4],namePlaceholder:c[5],image:c[6],imagePlaceholder:c[7],save:c[8]};}
