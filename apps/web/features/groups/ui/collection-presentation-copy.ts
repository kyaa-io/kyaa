import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string]>={
 ko:['상품 종류','판매처에서 보기','가격·배송·교환 조건은 판매처에서 확인해 주세요.'],en:['Product type','View at seller','Check prices, shipping and exchange terms with the seller.'],ja:['商品タイプ','販売店で見る','価格・配送・交換条件は販売店でご確認ください。'],'zh-Hans':['商品类型','前往卖家查看','请向卖家确认价格、配送和换货条件。'],'zh-Hant':['商品類型','前往賣家查看','請向賣家確認價格、配送和換貨條件。'],es:['Tipo de producto','Ver en la tienda','Consulta los precios, el envío y los cambios con el vendedor.'],id:['Jenis produk','Lihat di penjual','Periksa harga, pengiriman, dan ketentuan penukaran dengan penjual.'],vi:['Loại sản phẩm','Xem tại cửa hàng','Kiểm tra giá, giao hàng và điều kiện đổi hàng với người bán.'],th:['ประเภทสินค้า','ดูที่ร้านค้า','ตรวจสอบราคา การจัดส่ง และเงื่อนไขการเปลี่ยนสินค้ากับผู้ขาย'],pt:['Tipo de produto','Ver no vendedor','Consulte os preços, envio e condições de troca com o vendedor.'],fr:['Type de produit','Voir chez le vendeur','Consultez les prix, la livraison et les échanges auprès du vendeur.'],ru:['Тип товара','Посмотреть у продавца','Уточняйте цены, доставку и условия обмена у продавца.']};
const introduction:Record<AppLocale,readonly [string,string]>={
 ko:['{name}의 컬렉션','브랜드 상품과 굿즈'],
 en:['{name} collection','Brand products and merchandise'],
 ja:['{name}のコレクション','ブランド商品とグッズ'],
 'zh-Hans':['{name}的精选商品','品牌商品与周边'],
 'zh-Hant':['{name}的精選商品','品牌商品與周邊'],
 es:['Colección de {name}','Productos de marca y artículos para fans'],
 id:['Koleksi {name}','Produk merek dan merchandise'],
 vi:['Bộ sưu tập của {name}','Sản phẩm thương hiệu và vật phẩm dành cho người hâm mộ'],
 th:['คอลเลกชันของ {name}','สินค้าแบรนด์และสินค้าสำหรับแฟน ๆ'],
 pt:['Coleção de {name}','Produtos de marca e artigos para fãs'],
 fr:['Collection de {name}','Produits de marque et articles pour les fans'],
 ru:['Коллекция {name}','Брендовые товары и мерч'],
};
export const collectionPresentationCopy=(locale:AppLocale)=>{const [type,seller,notice]=copy[locale],[heading,description]=introduction[locale];return {type,seller,notice,heading,description};};
