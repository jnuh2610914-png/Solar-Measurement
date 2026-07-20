import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sun,
  Zap,
  Trees,
  MapPin,
  RotateCcw,
  Sparkles,
  History,
  ArrowRight,
  Info,
  Leaf,
  Landmark,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Download,
  AlertCircle,
  Gauge,
  Search,
  Sliders
} from "lucide-react";
import Markdown from "react-markdown";

// 위경도를 기상청 격자 좌표(NX, NY)로 변환하는 공식 함수
function convertToGrid(lat: number, lng: number) {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준점 경도(degree)
  const OLAT = 38.0; // 기준점 위도(degree)
  const XO = 43; // 기준점 X좌표(GRID)
  const YO = 136; // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  
  return {
    x: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
}

interface HistoryItem {
  id: string;
  date: string;
  region: string;
  consumption: number;
  generation: number;
  ratio: number;
  analysis: string;
}

interface RegionPreset {
  name: string;
  radiation: number;
  desc: string;
}

const REGION_PRESETS: RegionPreset[] = [
  { name: "제주", radiation: 3.8, desc: "일사량이 풍부한 대한민국 청정에너지의 중심" },
  { name: "서울", radiation: 3.2, desc: "대도시 환경이지만 최근 아파트 미니태양광이 활발한 지역" },
  { name: "부산", radiation: 3.7, desc: "남해안의 따사로운 햇살을 머금은 해양 에너지 도시" },
  { name: "인천", radiation: 3.3, desc: "서해안 해풍과 어우러져 신재생 에너지가 도약하는 도시" },
  { name: "광주", radiation: 3.6, desc: "햇빛 도시라 불릴 만큼 일사량이 뛰어난 호남 거점" },
  { name: "대전", radiation: 3.4, desc: "대덕연구단지와 과학 연구가 어우러진 친환경 스마트 도시" },
  { name: "경기", radiation: 3.3, desc: "전력 소비량이 많아 태양광 자립이 절실히 필요한 수도권" },
  { name: "강원", radiation: 3.5, desc: "높은 고도와 맑은 공기로 높은 태양광 발전 효율을 자랑하는 곳" },
];

const detectRegionFromAddress = (addr: string): string => {
  if (addr.includes("제주")) return "제주";
  if (addr.includes("부산")) return "부산";
  if (addr.includes("인천")) return "인천";
  if (addr.includes("광주")) return "광주";
  if (addr.includes("대전")) return "대전";
  if (addr.includes("경기")) return "경기";
  if (addr.includes("강원")) return "강원";
  if (addr.includes("대구") || addr.includes("울산") || addr.includes("경북") || addr.includes("경남")) return "부산";
  if (addr.includes("충남") || addr.includes("충북") || addr.includes("세종")) return "대전";
  if (addr.includes("전남") || addr.includes("전북")) return "광주";
  return "서울";
};

const getSliderVal = (val: number): number => {
  if (val <= 360) return ((val - 50) / (360 - 50)) * 50;
  return 50 + ((val - 360) / (2000 - 360)) * 50;
};

const getConsumptionFromSlider = (s: number): number => {
  if (s <= 50) return Math.round(50 + (s / 50) * (360 - 50));
  return Math.round(360 + ((s - 50) / 50) * (2000 - 360));
};

export default function App() {
  const [region, setRegion] = useState<string>("제주");
  const [consumption, setConsumption] = useState<number>(360); 
  const [generation, setGeneration] = useState<number>(120); 
  const isSuppressRecalc = useRef(false);

  const [sunshineHours, setSunshineHours] = useState<number>(4.0); 
  const [searchAddress, setSearchAddress] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("제주특별자치도 제주시 첨단로 242");

  const [isManualRatio, setIsManualRatio] = useState<boolean>(false);
  const [manualRatio, setManualRatio] = useState<number>(34.3);

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const REGION_COORDS: { [key: string]: { lat: number; lng: number } } = {
    "제주": { lat: 33.4996, lng: 126.5312 },
    "서울": { lat: 37.5665, lng: 126.9780 },
    "부산": { lat: 35.1796, lng: 129.0756 },
    "인천": { lat: 37.4563, lng: 126.7052 },
    "광주": { lat: 35.1595, lng: 126.8526 },
    "대전": { lat: 36.3504, lng: 127.3845 },
    "경기": { lat: 37.2750, lng: 127.0090 },
    "강원": { lat: 37.8859, lng: 127.7300 }
  };

  const [weatherLabel, setWeatherLabel] = useState<string>("맑음 ☀️");
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);

  // ==========================================
  // ⭐ [필수 수정] 여기에 본인의 카카오 및 기상청 API 키를 정확히 입력하세요!
  // ==========================================
  const KAKAO_API_KEY = "••••••••••••••••••••••••••••••••"; 
  const WEATHER_API_KEY = "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"; 

  // 기상청 실시간 단기예보 동기화 함수 (위도, 경도 기반)
  const fetchLiveWeather = async (lat: number, lng: number) => {
    setWeatherLoading(true);
    try {
      const grid = convertToGrid(lat, lng);
      const now = new Date();
      const baseDate = now.toISOString().slice(0, 10).replace(/-/g, "");
      
      // 안전한 기본 데이터 조회를 위해 오전 05시 예보 데이터 기준 호출
      const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(WEATHER_API_KEY)}&pageNo=1&numOfRows=50&dataType=JSON&base_date=${baseDate}&base_time=0500&nx=${grid.x}&ny=${grid.y}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.response?.header?.resultCode === "00") {
        const items = data.response.body.items.item;
        const skyItem = items.find((i: any) => i.category === "SKY");
        
        if (skyItem) {
          const skyVal = parseInt(skyItem.fcstValue); // 1: 맑음, 3: 구름많음, 4: 흐림
          const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
          
          if (skyVal === 1) {
            setWeatherLabel("맑음 ☀️");
            setSunshineHours(Math.round(basePreset.radiation * 1.2 * 10) / 10);
            triggerToast("기상청 실시간 예보: 맑음! 태양광 발전 효율이 향상됩니다. ☀️");
          } else if (skyVal === 3) {
            setWeatherLabel("구름많음 ⛅");
            setSunshineHours(Math.round(basePreset.radiation * 0.7 * 10) / 10);
            triggerToast("기상청 실시간 예보: 구름 많음. 발전 효율이 다소 완화됩니다. ⛅");
          } else {
            setWeatherLabel("흐림 ☁️");
            setSunshineHours(Math.round(basePreset.radiation * 0.3 * 10) / 10);
            triggerToast("기상청 실시간 예보: 흐림/비. 일조량이 감소합니다. ☁️");
          }
        }
      } else {
        throw new Error("API Header Error");
      }
    } catch (err) {
      console.warn("기상청 API 연동 실패, 지역 기본값 대체");
      const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
      setSunshineHours(basePreset.radiation);
      setWeatherLabel("기본값 통계 🌤️");
    } finally {
      setWeatherLoading(false);
    }
  };

  // 단순 지역 토글 시 기본 날씨 세팅
  useEffect(() => {
    const coords = REGION_COORDS[region] || REGION_COORDS["제주"];
    if (WEATHER_API_KEY && WEATHER_API_KEY !== "여기에_진짜_기상청_인증키_입력") {
      fetchLiveWeather(coords.lat, coords.lng);
    } else {
      const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
      setSunshineHours(basePreset.radiation);
      setWeatherLabel("수동 모드 🌤️");
    }
  }, [region]);

  useEffect(() => {
    if (isSuppressRecalc.current) return;
    const monthlyGen = Math.round(3 * sunshineHours * 0.75 * 30);
    setGeneration(monthlyGen);
  }, [sunshineHours]);

  // 카카오 지도 완전 독립 로드 로직
  useEffect(() => {
    let isMounted = true;
    let mapInstance: any = null;

    if (!KAKAO_API_KEY || KAKAO_API_KEY === "여기에_진짜_카카오_자바스크립트_키_입력") {
      return;
    }

    const initializeMap = () => {
      const container = document.getElementById("kakao-map");
      if (!container || !(window as any).kakao || !(window as any).kakao.maps) return;

      const coords = REGION_COORDS[region] || REGION_COORDS["제주"];
      
      (window as any).kakao.maps.load(() => {
        if (!isMounted) return;
        const options = {
          center: new (window as any).kakao.maps.LatLng(coords.lat, coords.lng),
          level: 8
        };
        
        container.innerHTML = "";
        mapInstance = new (window as any).kakao.maps.Map(container, options);

        const zoomControl = new (window as any).kakao.maps.ZoomControl();
        mapInstance.addControl(zoomControl, (window as any).kakao.maps.ControlPosition.RIGHT);

        const markerPosition = new (window as any).kakao.maps.LatLng(coords.lat, coords.lng);
        const marker = new (window as any).kakao.maps.Marker({
          position: markerPosition,
          draggable: true
        });
        marker.setMap(mapInstance);

        const infowindow = new (window as any).kakao.maps.InfoWindow({
          content: `<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; text-align:center; min-width:180px;">태양광 진단 위치 ☀️</div>`
        });
        infowindow.open(mapInstance, marker);

        const updateData = (lat: number, lng: number) => {
          const geocoder = new (window as any).kakao.maps.services.Geocoder();
          geocoder.coord2Address(lng, lat, (result: any, status: any) => {
            if (status === (window as any).kakao.maps.services.Status.OK) {
              const detailAddr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
              if (isMounted) {
                setCurrentAddress(detailAddr);
                setIsManualRatio(false);
                const detected = detectRegionFromAddress(detailAddr);
                if (detected !== region) setRegion(detected);
                
                infowindow.setContent(`<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; text-align:center; max-width:200px;">${detailAddr}</div>`);
                infowindow.open(mapInstance, marker);
                
                fetchLiveWeather(lat, lng);
              }
            }
          });
        };

        (window as any).kakao.maps.event.addListener(mapInstance, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.getLatLng();
          marker.setPosition(latlng);
          updateData(latlng.getLat(), latlng.getLng());
        });

        (window as any).kakao.maps.event.addListener(marker, 'dragend', () => {
          const latlng = marker.getPosition();
          updateData(latlng.getLat(), latlng.getLng());
        });

        (window as any).currentMapInstance = mapInstance;
        (window as any).currentMapMarker = marker;
        (window as any).currentMapInfoWindow = infowindow;
      });
    };

    if ((window as any).kakao && (window as any).kakao.maps) {
      initializeMap();
    } else {
      const script = document.createElement("script");
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false&libraries=services`;
      script.async = true;
      document.head.appendChild(script);
      script.onload = initializeMap;
    }

    return () => { isMounted = false; };
  }, [region]);

  const handleAddressSearch = () => {
    if (!searchAddress.trim()) return;
    
    if ((window as any).kakao && (window as any).kakao.maps?.services) {
      const geocoder = new (window as any).kakao.maps.services.Geocoder();
      geocoder.addressSearch(searchAddress, (result: any, status: any) => {
        if (status === (window as any).kakao.maps.services.Status.OK) {
          const lat = parseFloat(result[0].y);
          const lng = parseFloat(result[0].x);
          const detailAddr = result[0].address_name;
          
          const mapInstance = (window as any).currentMapInstance;
          const marker = (window as any).currentMapMarker;
          const infowindow = (window as any).currentMapInfoWindow;
          
          if (mapInstance && marker) {
            const loc = new (window as any).kakao.maps.LatLng(lat, lng);
            mapInstance.setCenter(loc);
            marker.setPosition(loc);
            if (infowindow) {
              infowindow.setContent(`<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; text-align:center; max-width:200px;">${detailAddr}</div>`);
              infowindow.open(mapInstance, marker);
            }
          }
          
          setCurrentAddress(detailAddr);
          setIsManualRatio(false);
          const detected = detectRegionFromAddress(detailAddr);
          if (detected !== region) setRegion(detected);
          fetchLiveWeather(lat, lng);
        }
      });
    }
  };

  const loadingMessages = [
    "태양광 발전에 알맞은 날씨와 지역적 특성을 AI가 분석하고 있습니다... ☀️",
    "이산화탄소 감축량과 소나무 식목 환산 효과를 꼼꼼히 확인하고 있어요... 🌱",
    "이 가정이 얻고 있는 경제적 혜택과 절감 효과를 종합적으로 산정 중입니다... 💰",
    "앞으로 자립도를 200% 더 끌어올릴 수 있는 실생활 실천 꿀팁을 작성하고 있어요... 💡",
  ];

  const computedRatio = consumption > 0 ? Math.round((generation / consumption) * 1000) / 10 : 0;
  const activeRatio = isManualRatio ? manualRatio : computedRatio;
  const savedMoney = Math.round(generation * 200); 
  const co2Reduction = (generation * 0.441).toFixed(1); 
  const pineTrees = (parseFloat(co2Reduction) / 6.6).toFixed(1); 

  const getStatusInfo = (ratio: number) => {
    if (ratio >= 100) return { label: "에너지 자립 영웅 🏆", color: "text-white bg-[#748E63] border-[#748E63]", desc: "사용하는 전기를 뛰어넘어 친환경 에너지를 생산 중이에요!" };
    if (ratio >= 50) return { label: "우수 에너지 자립가 ⭐", color: "text-[#748E63] bg-[#F1F3E9] border-[#E2E6D5]", desc: "우리 집 절반 이상의 에너지를 태양광으로 자급자족하고 있습니다." };
    if (ratio >= 20) return { label: "새싹 자립가 🌤️", color: "text-[#5A5A40] bg-[#F7F8F2] border-[#D1D6BC]", desc: "의미 있는 비율을 스스로 충당하며 가계와 환경을 살리고 있어요!" };
    return { label: "초보 자립가 🔌", color: "text-[#8A8D7C] bg-[#F7F8F2] border-[#E9EBE0]", desc: "시작이 절반! 에너지 사용 요령을 터득해 자립률을 높여보아요." };
  };

  const status = getStatusInfo(activeRatio);

  useEffect(() => {
    const saved = localStorage.getItem("solar_independence_history");
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setTimeout(() => {
      const finalGen = generation;
      const finalRatio = activeRatio;
      const finalMoney = savedMoney.toLocaleString();

      const analysisMarkdown = `## 🌱 ${region} 지역 가정을 위한 태양광 자립 정밀 분석 결과

안녕하세요! ${region}의 기상 조건[\`${weatherLabel}\`] 하에서 태양광 에너지를 멋지게 실천하고 계시는 가정의 에너지 자립도를 분석해 드립니다. ☀️

---

### 📊 우리 집 에너지 자립도 성적표
* **우리 집 전체 전기 사용량**: \`${consumption} kWh\`
* **실제 태양광 발전량**: \`${finalGen} kWh\`
* **에너지 자립도**: **${finalRatio}%** 👏

> **"우리 집 전체 전기 사용량 중 무려 ${finalRatio}%를 친환경 태양광 발전기로 직접 해결하셨습니다!"**  
현재 기상청 실시간 기상 상태와 전력 요율을 바탕으로 진단한 결과, 매우 훌륭한 환경 기여도를 달성하고 계십니다.

---

### 💰 지갑을 지키는 경제적 이득 (한 달 환산)
- **추정 전기요금 절감액**: **약 ${finalMoney}원** 💸
  - 태양광 자급자족을 통해 외부 전력 구매량을 줄임과 동시에, 전력 누진 단계 진입을 차단하는 효과적인 경제 방패 역할을 해내고 있습니다.

---

### 🌳 지구를 살리는 초록빛 지구 지킴이 효과
- **이산화탄소(CO2) 감축량**: **약 ${co2Reduction} kg** 🌱
- **소나무 식재 환산**: **약 ${pineTrees}그루**를 한 해 동안 심고 가꾼 소중한 가치와 같습니다.`;

      setAnalysis(analysisMarkdown);

      const newItem: HistoryItem = {
        id: "analysis-" + Date.now(),
        date: new Date().toLocaleDateString("ko-KR"),
        region,
        consumption,
        generation,
        ratio: finalRatio,
        analysis: analysisMarkdown,
      };

      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      localStorage.setItem("solar_independence_history", JSON.stringify(updatedHistory));
      setSelectedHistoryId(newItem.id);
      triggerToast("AI 전문가의 자립도 정밀 진단서가 생성되었습니다! 🌱");
      setLoading(false);
    }, 2000);
  };

  const handleLoadHistory = (item: HistoryItem) => {
    isSuppressRecalc.current = true;
    setRegion(item.region);
    setConsumption(item.consumption);
    setGeneration(item.generation);
    setAnalysis(item.analysis);
    setSelectedHistoryId(item.id);
    setTimeout(() => { isSuppressRecalc.current = false; }, 100);
  };

  return (
    <div className="min-h-screen bg-[#F7F8F2] font-sans text-[#4A4A35] pb-12">
      <AnimatePresence>
        {toastMsg && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#4A4A35] text-white px-6 py-3 rounded-full shadow-xl text-sm font-medium border border-[#5A5A40]">
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 pt-6">
        <header className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 shadow-sm mb-8">
          <h1 className="text-2xl font-serif font-bold text-[#4A4A35]">Solar Measurement</h1>
          <p className="text-[#8A8D7C] text-sm mt-1.5">기상청 단기예보 실시간 API 연동 및 에너지 자립도 시뮬레이터 시스템</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT PANEL */}
          <section className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0] flex flex-col gap-5">
              <div className="flex justify-between items-center border-b pb-3">
                <span className="font-bold text-sm">실시간 지도 & 날씨 센서</span>
                <span className="text-xs font-bold bg-[#F1F3E9] text-[#748E63] px-2.5 py-1 rounded-full border">
                  {weatherLoading ? "조회중..." : weatherLabel}
                </span>
              </div>

              {/* MAP DIV */}
              <div className="h-64 rounded-2xl border border-[#E9EBE0] overflow-hidden shadow-sm">
                <div id="kakao-map" className="w-full h-full min-h-[240px] bg-stone-100 flex items-center justify-center text-xs text-stone-400">
                  { (KAKAO_API_KEY === "여기에_진짜_카카오_자바스크립트_키_입력") ? "⚠️ 코드를 열고 KAKAO_API_KEY를 입력해주세요." : "지도 로딩 중..." }
                </div>
              </div>

              <div className="bg-[#F7F8F2] p-3 rounded-xl border text-xs text-[#4A4A35]">
                <b>📍 분석 주소:</b> {currentAddress}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchAddress}
                  onChange={(e) => setSearchAddress(e.target.value)}
                  placeholder="예: 제주시 첨단로 242"
                  className="flex-1 pl-3 pr-4 py-2 text-sm bg-[#F7F8F2] border rounded-xl focus:outline-none focus:border-[#748E63]"
                />
                <button onClick={handleAddressSearch} className="bg-[#4A4A35] text-white px-4 py-2 rounded-xl text-sm font-semibold">검색</button>
              </div>

              <div className="bg-[#F7F8F2] p-4 rounded-2xl flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#8A8D7C]">🏡 월 전력 소비량</span>
                  <span className="text-sm font-extrabold bg-white px-2.5 py-1 rounded-lg border">{consumption} kWh</span>
                </div>
                <input type="range" min="0" max="100" value={getSliderVal(consumption)} onChange={(e) => setConsumption(getConsumptionFromSlider(parseInt(e.target.value)))} className="accent-[#748E63] cursor-pointer" />
              </div>

              <div className="bg-[#F7F8F2] p-4 rounded-2xl flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold text-[#8A8D7C]">
                  <span>☀️ 현재 날씨 기반 하루 일조 시간</span>
                  <span className="text-[#4A4A35] bg-white px-2 py-0.5 rounded border">{sunshineHours} 시간</span>
                </div>
                <p className="text-[10px] text-[#8A8D7C]">지도를 클릭하거나 주소를 검색하면 기상청 실시간 위성 예보에 맞춰 일조량이 완전 자동으로 조절됩니다.</p>
              </div>

              <button onClick={handleAnalyze} className="w-full bg-[#748E63] hover:bg-[#637d53] text-white py-3.5 rounded-2xl font-semibold shadow-md transition-all">
                AI 에너지 자립도 정밀 진단 시작하기
              </button>
            </div>
          </section>

          {/* RIGHT PANEL */}
          <section className="lg:col-span-7 space-y-6">
            <AnimatePresence>
              {loading && (
                <div className="bg-white/90 border rounded-[32px] p-8 text-center flex flex-col items-center justify-center min-h-[400px] gap-4">
                  <div className="w-10 h-10 rounded-full border-4 border-t-[#748E63] animate-spin" />
                  <p className="text-sm font-semibold text-[#4A4A35]">{loadingMessages[loadingStep]}</p>
                </div>
              )}
            </AnimatePresence>

            {!loading && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block">월간 태양광 발전</span><span className="text-lg font-black">{generation} kWh</span></div>
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block">에너지 자립도</span><span className="text-lg font-black text-[#748E63]">{activeRatio}%</span></div>
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block">예상 절감 금액</span><span className="text-lg font-black">약 {savedMoney.toLocaleString()}원</span></div>
                </div>

                <div className={`p-5 rounded-2xl border ${status.color}`}>
                  <h4 className="text-base font-black">{status.label}</h4>
                  <p className="text-xs mt-1">{status.desc}</p>
                </div>

                {analysis ? (
                  <div className="bg-white border rounded-[32px] p-6 shadow-sm prose text-sm text-[#5A5A40]">
                    <Markdown>{analysis}</Markdown>
                  </div>
                ) : (
                  <div className="bg-white border rounded-[32px] p-8 text-center text-[#8A8D7C] text-sm min-h-[200px] flex items-center justify-center">
                    지도를 클릭해 주소를 불러온 뒤, 진단 시작하기 버튼을 눌러주세요.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
