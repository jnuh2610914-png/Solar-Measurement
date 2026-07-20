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

function convertToGrid(lat: number, lng: number) {
  const RE = 6371.00877; 
  const GRID = 5.0; 
  const SLAT1 = 30.0; 
  const SLAT2 = 60.0; 
  const OLON = 126.0; 
  const OLAT = 38.0; 
  const XO = 43; 
  const YO = 136; 

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
  if (addr.includes("서울")) return "서울";
  if (addr.includes("부산")) return "부산";
  if (addr.includes("인천")) return "인천";
  if (addr.includes("광주")) return "광주";
  if (addr.includes("대전")) return "대전";
  if (addr.includes("경기")) return "경기";
  if (addr.includes("강원")) return "강원";
  return "제주";
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

  // 기상청 데이터로 완전 자동 연동되는 일조시간 상태
  const [sunshineHours, setSunshineHours] = useState<number>(3.8); 
  const [searchAddress, setSearchAddress] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("제주특별자치도 제주시 첨단로 242");

  const [loading, setLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);

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

  const [weatherLabel, setWeatherLabel] = useState<string>("조회 대기중 🌤️");

  // ==========================================
  // ⭐ [필수 수정] 여기에 본인의 카카오 및 기상청 API 키를 정확히 입력하세요!
  // ==========================================
  const KAKAO_API_KEY = "••••••••••••••••••••••••••••••••"; 
  const WEATHER_API_KEY = "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"; 

  // 기상청 실시간 단기예보 동기화 함수
  const fetchLiveWeather = async (lat: number, lng: number) => {
    try {
      const grid = convertToGrid(lat, lng);
      const now = new Date();
      const baseDate = now.toISOString().slice(0, 10).replace(/-/g, "");
      
      const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(WEATHER_API_KEY)}&pageNo=1&numOfRows=50&dataType=JSON&base_date=${baseDate}&base_time=0500&nx=${grid.x}&ny=${grid.y}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.response?.header?.resultCode === "00") {
        const items = data.response.body.items.item;
        const skyItem = items.find((i: any) => i.category === "SKY");
        
        if (skyItem) {
          const skyVal = parseInt(skyItem.fcstValue); 
          const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
          
          if (skyVal === 1) {
            setWeatherLabel("맑음 ☀️");
            setSunshineHours(Math.round(basePreset.radiation * 1.2 * 10) / 10);
            triggerToast("기상청 데이터 반영: 맑음 ☀️");
          } else if (skyVal === 3) {
            setWeatherLabel("구름많음 ⛅");
            setSunshineHours(Math.round(basePreset.radiation * 0.7 * 10) / 10);
            triggerToast("기상청 데이터 반영: 구름많음 ⛅");
          } else {
            setWeatherLabel("흐림 ☁️");
            setSunshineHours(Math.round(basePreset.radiation * 0.3 * 10) / 10);
            triggerToast("기상청 데이터 반영: 흐림 ☁️");
          }
        }
      } else {
        throw new Error();
      }
    } catch (err) {
      const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
      setSunshineHours(basePreset.radiation);
      setWeatherLabel("기본 통계치 🌤️");
    }
  };

  useEffect(() => {
    const monthlyGen = Math.round(3 * sunshineHours * 0.75 * 30);
    setGeneration(monthlyGen);
  }, [sunshineHours]);

  // 카카오 지도 완전 수립 로직
  useEffect(() => {
    if (!KAKAO_API_KEY || KAKAO_API_KEY === "여기에_진짜_카카오_자바스크립트_키_입력") return;

    const coords = REGION_COORDS[region] || REGION_COORDS["제주"];

    const startMap = () => {
      if (!(window as any).kakao || !(window as any).kakao.maps) return;

      (window as any).kakao.maps.load(() => {
        const container = document.getElementById("kakao-map");
        if (!container) return;

        container.innerHTML = "";
        const options = {
          center: new (window as any).kakao.maps.LatLng(coords.lat, coords.lng),
          level: 7
        };
        const mapInstance = new (window as any).kakao.maps.Map(container, options);

        const markerPosition = new (window as any).kakao.maps.LatLng(coords.lat, coords.lng);
        const marker = new (window as any).kakao.maps.Marker({
          position: markerPosition,
          draggable: true
        });
        marker.setMap(mapInstance);

        const infowindow = new (window as any).kakao.maps.InfoWindow({
          content: `<div style="padding:6px; font-size:12px; font-weight:bold; text-align:center; min-width:150px;">태양광 측정 지점</div>`
        });
        infowindow.open(mapInstance, marker);

        const handleCoordChange = (lat: number, lng: number) => {
          const geocoder = new (window as any).kakao.maps.services.Geocoder();
          geocoder.coord2Address(lng, lat, (result: any, status: any) => {
            if (status === (window as any).kakao.maps.services.Status.OK) {
              const detailAddr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
              setCurrentAddress(detailAddr);
              const detected = detectRegionFromAddress(detailAddr);
              setRegion(detected);
              infowindow.setContent(`<div style="padding:6px; font-size:12px; font-weight:bold; text-align:center; max-width:180px;">${detailAddr}</div>`);
              infowindow.open(mapInstance, marker);
              fetchLiveWeather(lat, lng);
            }
          });
        };

        (window as any).kakao.maps.event.addListener(mapInstance, 'click', (e: any) => {
          marker.setPosition(e.latLng);
          handleCoordChange(e.latLng.getLat(), e.latLng.getLng());
        });

        (window as any).kakao.maps.event.addListener(marker, 'dragend', () => {
          const pos = marker.getPosition();
          handleCoordChange(pos.getLat(), pos.getLng());
        });

        (window as any).currentMapInstance = mapInstance;
        (window as any).currentMapMarker = marker;
        (window as any).currentMapInfoWindow = infowindow;
      });
    };

    if ((window as any).kakao && (window as any).kakao.maps) {
      startMap();
    } else {
      const script = document.createElement("script");
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false&libraries=services`;
      script.async = true;
      document.head.appendChild(script);
      script.onload = startMap;
    }
  }, []);

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
              infowindow.setContent(`<div style="padding:6px; font-size:12px; font-weight:bold; text-align:center; max-width:180px;">${detailAddr}</div>`);
              infowindow.open(mapInstance, marker);
            }
          }
          setCurrentAddress(detailAddr);
          const detected = detectRegionFromAddress(detailAddr);
          setRegion(detected);
          fetchLiveWeather(lat, lng);
        }
      });
    }
  };

  const computedRatio = consumption > 0 ? Math.round((generation / consumption) * 1000) / 10 : 0;
  const savedMoney = Math.round(generation * 200); 
  const co2Reduction = (generation * 0.441).toFixed(1); 
  const pineTrees = (parseFloat(co2Reduction) / 6.6).toFixed(1); 

  const getStatusInfo = (ratio: number) => {
    if (ratio >= 100) return { label: "에너지 자립 영웅 🏆", color: "text-white bg-[#748E63] border-[#748E63]", desc: "사용하는 전기를 뛰어넘어 친환경 에너지를 생산 중이에요!" };
    if (ratio >= 50) return { label: "우수 에너지 자립가 ⭐", color: "text-[#748E63] bg-[#F1F3E9] border-[#E2E6D5]", desc: "우리 집 절반 이상의 에너지를 태양광으로 자급자족하고 있습니다." };
    if (ratio >= 20) return { label: "새싹 자립가 🌤️", color: "text-[#5A5A40] bg-[#F7F8F2] border-[#D1D6BC]", desc: "의미 있는 비율을 스스로 충당하며 가계와 환경을 살리고 있어요!" };
    return { label: "초보 자립가 🔌", color: "text-[#8A8D7C] bg-[#F7F8F2] border-[#E9EBE0]", desc: "시작이 절반! 에너지 사용 요령을 터득해 자립률을 높여보아요." };
  };

  const status = getStatusInfo(computedRatio);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setTimeout(() => {
      const analysisMarkdown = `## 🌱 ${region} 지역 실시간 에너지 자립 진단서

기상청 실시간 센서[\`${weatherLabel}\`]와 연동하여 분석한 결과입니다.

---

### 📊 종합 분석 스코어
* **월 평균 전기 사용량**: \`${consumption} kWh\`
* **태양광 자동 예측 발전량**: \`${generation} kWh\`
* **최종 에너지 자립도**: **${computedRatio}%** 🥳

> 본 가정은 소비 전력량의 약 **${computedRatio}%**를 스스로 자급하고 있습니다.

---

### 💰 가계 절감 경제 효과
- **당월 요금 절감액**: **약 ${savedMoney.toLocaleString()}원** 절감 💸
- 탄소 배출 절감량 **${co2Reduction}kg** 및 **소나무 ${pineTrees}그루** 효과를 창출했습니다.`;

      setAnalysis(analysisMarkdown);
      setLoading(false);
      triggerToast("AI 진단서 작성이 완료되었습니다! 🌱");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#F7F8F2] font-sans text-[#4A4A35] pb-12">
      <AnimatePresence>
        {toastMsg && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#4A4A35] text-white px-6 py-3 rounded-full shadow-xl text-sm font-medium">
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
              
              {/* 카카오 맵 고정 영역 (너비와 높이를 확실히 줘서 무조건 뜨게 잡음) */}
              <div className="w-full h-64 rounded-2xl border border-[#E9EBE0] overflow-hidden shadow-sm relative bg-stone-100">
                <div id="kakao-map" className="w-full h-full min-h-[256px]"></div>
              </div>

              {/* 현재 선택된 위치 알림창 */}
              <div className="bg-[#F7F8F2] p-5 rounded-2xl border border-[#E9EBE0] text-sm">
                <div className="flex items-center gap-2 text-[#748E63] font-bold mb-1.5">
                  <MapPin size={16} />
                  <span>현재 선택된 위치:</span>
                </div>
                <div className="font-extrabold text-base text-[#4A4A35] mb-2">{currentAddress}</div>
                <p className="text-xs text-[#8A8D7C] leading-relaxed">
                  지도를 클릭하거나 주소를 검색하면 기상청 실시간 예보를 받아와 자동으로 일조량을 계산합니다.
                </p>
              </div>

              {/* 주소 검색창 */}
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8D7C]" />
                  <input
                    type="text"
                    value={searchAddress}
                    onChange={(e) => setSearchAddress(e.target.value)}
                    placeholder="예: 제주시 첨단로 242"
                    className="w-full pl-9 pr-4 py-3 text-sm bg-white border border-[#E9EBE0] rounded-xl focus:outline-none focus:border-[#748E63]"
                  />
                </div>
                <button onClick={handleAddressSearch} className="bg-[#4A4A35] hover:bg-[#3d3d2c] text-white px-5 py-3 rounded-xl text-sm font-bold shadow-sm transition-all">
                  검색
                </button>
              </div>

              {/* 월 전력 소비량 설정 슬라이더 */}
              <div className="bg-white border border-[#E9EBE0] p-5 rounded-2xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-[#4A4A35] flex items-center gap-1.5">
                    <Sliders size={15} className="text-[#8A8D7C]" /> 월 전력 소비량 설정
                  </span>
                  <span className="text-sm font-extrabold bg-[#F7F8F2] px-3 py-1 rounded-lg border border-[#E9EBE0] text-[#4A4A35] shadow-inner">
                    {consumption} kWh
                  </span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={getSliderVal(consumption)} 
                  onChange={(e) => setConsumption(getConsumptionFromSlider(parseInt(e.target.value)))} 
                  className="accent-[#748E63] cursor-pointer w-full h-1.5 bg-[#E9EBE0] rounded-lg appearance-none" 
                />
                <div className="flex justify-between text-[11px] text-[#8A8D7C]">
                  <span>50 kWh (최소)</span>
                  <span>360 kWh (평균)</span>
                  <span>2,000 kWh (최대)</span>
                </div>
              </div>

              {/* ⚡ [수정완료] 일조 시간 슬라이더를 완전히 없애고 넣은 기상청 정보창 */}
              <div className="bg-[#F1F3E9] border border-[#E2E6D5] p-4 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[#748E63]">☀️ 기상청 예보 센서 자동 계산</div>
                  <div className="text-[#8A8D7C] mt-0.5">실시간 하늘 상태: <b className="text-[#4A4A35]">{weatherLabel}</b></div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-[#748E63] bg-white px-2 py-1 rounded-md border">{sunshineHours} 시간</span>
                  <div className="text-[9px] text-[#8A8D7C] mt-1">일조량 반영 완료</div>
                </div>
              </div>

              {/* 진단 시작 버튼 */}
              <button onClick={handleAnalyze} className="w-full bg-[#748E63] hover:bg-[#637d53] text-white py-4 rounded-2xl font-bold shadow-md text-base transition-all flex items-center justify-center gap-2">
                <Sparkles size={18} /> AI 에너지 자립도 정밀 진단 시작하기
              </button>
            </div>
          </section>

          {/* RIGHT PANEL */}
          <section className="lg:col-span-7 space-y-6">
            <AnimatePresence>
              {loading && (
                <div className="bg-white border rounded-[32px] p-8 text-center flex flex-col items-center justify-center min-h-[350px] gap-4">
                  <div className="w-10 h-10 rounded-full border-4 border-t-[#748E63] animate-spin" />
                  <p className="text-sm font-semibold text-[#4A4A35]">시뮬레이션 분석 중...</p>
                </div>
              )}
            </AnimatePresence>

            {!loading && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block mb-1">월간 태양광 발전</span><span className="text-xl font-black">{generation} kWh</span></div>
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block mb-1">에너지 자립도</span><span className="text-xl font-black text-[#748E63]">{computedRatio}%</span></div>
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block mb-1">예상 절감 금액</span><span className="text-xl font-black">약 {savedMoney.toLocaleString()}원</span></div>
                </div>

                <div className={`p-5 rounded-2xl border ${status.color} shadow-sm`}>
                  <h4 className="text-base font-black">{status.label}</h4>
                  <p className="text-xs mt-1 leading-relaxed">{status.desc}</p>
                </div>

                {analysis ? (
                  <div className="bg-white border rounded-[32px] p-6 shadow-sm prose text-sm text-[#5A5A40]">
                    <Markdown>{analysis}</Markdown>
                  </div>
                ) : (
                  <div className="bg-white border rounded-[32px] p-8 text-center text-[#8A8D7C] text-sm min-h-[200px] flex items-center justify-center border-dashed">
                    지도를 클릭하거나 주소를 검색해 자립도 정밀 진단을 시작해 보세요.
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
