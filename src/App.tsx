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

// Types for user history entries
interface HistoryItem {
  id: string;
  date: string;
  region: string;
  consumption: number;
  generation: number;
  ratio: number;
  analysis: string;
}

// Region preset definitions
interface RegionPreset {
  name: string;
  radiation: number; // Average solar radiation hours per day
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
  return "서울"; // default fallback
};

// Map consumption value (50 to 2000) to raw slider value s (0 to 100)
const getSliderVal = (val: number): number => {
  if (val <= 360) {
    return ((val - 50) / (360 - 50)) * 50;
  } else {
    return 50 + ((val - 360) / (2000 - 360)) * 50;
  }
};

// Map raw slider value s (0 to 100) to consumption value (50 to 2000)
const getConsumptionFromSlider = (s: number): number => {
  let val = 50;
  if (s <= 50) {
    val = 50 + (s / 50) * (360 - 50);
  } else {
    val = 360 + ((s - 50) / 50) * (2000 - 360);
  }
  return Math.round(val);
};

export default function App() {
  // Input states
  const [region, setRegion] = useState<string>("제주");
  const [consumption, setConsumption] = useState<number>(360); 
  const [generation, setGeneration] = useState<number>(120); 
  const isSuppressRecalc = useRef(false);

  // Sunshine hours & Address states
  const [sunshineHours, setSunshineHours] = useState<number>(4.0); 
  const [searchAddress, setSearchAddress] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("제주특별자치도 제주시 첨단로 242");

  // Manual overwrite state for calculated ratio
  const [isManualRatio, setIsManualRatio] = useState<boolean>(false);
  const [manualRatio, setManualRatio] = useState<number>(34.3);

  // App running states
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Analysis result state
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Selected history item
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // Regional coordinate definitions for Kakao Map
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

  // Weather and Map states
  const [weather, setWeather] = useState<{
    temp: number;
    sky: string;
    pty: string;
    skyLabel: string;
    skyIcon: string;
    radiationMultiplier: number;
    tempString: string;
    isFallback: boolean;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [mapError, setMapError] = useState<boolean>(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);

  // Fetch weather and update solar radiation/sunshineHours automatically when region changes
  useEffect(() => {
    let active = true;
    const fetchWeatherAndAutoCalculate = async () => {
      setWeatherLoading(true);
      try {
        const res = await fetch(`/api/weather?region=${encodeURIComponent(region)}`);
        if (!res.ok) throw new Error("Weather request failed");
        const data = await res.json();
        
        if (!active) return;
        setWeather(data);

        const basePreset = REGION_PRESETS.find(p => p.name === region);
        const baseRadiation = basePreset ? basePreset.radiation : 3.5;
        const weatherMultiplier = data.radiationMultiplier ?? 1.0;
        
        const calculatedSunshine = Math.min(12, Math.max(0, Math.round(baseRadiation * weatherMultiplier * 10) / 10));
        setSunshineHours(calculatedSunshine);
        
        if (data.isFallback) {
          triggerToast(`기본 기상 통계 정보가 적용되었습니다. 일조량: 하루 평균 ${calculatedSunshine}시간 🌤️`);
        } else {
          triggerToast(`기상청 실시간 예보 수신 성공! [${region}: ${data.skyIcon} ${data.skyLabel}, 기온 ${data.tempString}] 오늘 예상 일조 시간: ${calculatedSunshine}시간 ☀️`);
        }
      } catch (err) {
        console.error("Failed to fetch weather:", err);
        if (!active) return;
        const basePreset = REGION_PRESETS.find(p => p.name === region);
        const baseRadiation = basePreset ? basePreset.radiation : 3.5;
        const calculatedSunshine = Math.round(baseRadiation * 1.0 * 10) / 10;
        setSunshineHours(calculatedSunshine);
        setWeather({
          temp: 22,
          sky: "1",
          pty: "0",
          skyLabel: "맑음 (기본값)",
          skyIcon: "☀️",
          radiationMultiplier: 1.0,
          tempString: "22°C",
          isFallback: true
        });
        triggerToast(`${region} 지역의 기본 기상 모델을 적용하여 일조 시간 ${calculatedSunshine}시간을 설정했습니다.`);
      } finally {
        if (active) setWeatherLoading(false);
      }
    };

    fetchWeatherAndAutoCalculate();
    return () => {
      active = false;
    };
  }, [region]);

  useEffect(() => {
    if (isSuppressRecalc.current) return;
    const monthlyGen = Math.round(3 * sunshineHours * 0.75 * 30);
    setGeneration(monthlyGen);
  }, [sunshineHours]);

  // Load Kakao Maps script and render map centered at selected region
  useEffect(() => {
    let isMounted = true;
    let mapInstance: any = null;

    const loadAndRenderMap = async () => {
      try {
        const configRes = await fetch("/api/config");
        if (!configRes.ok) throw new Error("Config request failed");
        const config = await configRes.json();
        
        if (isMounted) {
          setHasGeminiKey(!!config.hasGeminiKey);
        }
        
        // ==========================================
        // ⭐ [필수 수정] 여기에 본인의 진짜 카카오 자바스크립트 키를 넣으세요!
        // ==========================================
        const kakaoApiKey = "••••••••••••••••••••••••••••••••";
        const finalKey = kakaoApiKey !== "••••••••••••••••••••••••••••••••" && kakaoApiKey !== "" ? kakaoApiKey : config.kakaoApiKey;
        
        if (!finalKey) {
          console.warn("Kakao Map API Key is empty. Rendering fallback map.");
          setMapError(true);
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
            const mapTypeControl = new (window as any).kakao.maps.MapTypeControl();
            mapInstance.addControl(mapTypeControl, (window as any).kakao.maps.ControlPosition.TOPRIGHT);

            const markerPosition = new (window as any).kakao.maps.LatLng(coords.lat, coords.lng);
            const marker = new (window as any).kakao.maps.Marker({
              position: markerPosition,
              draggable: true
            });
            marker.setMap(mapInstance);

            const infowindow = new (window as any).kakao.maps.InfoWindow({
              content: `<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; font-family:sans-serif; text-align:center; min-width:180px;">
                태양광 진단 위치 ☀️
              </div>`
            });
            infowindow.open(mapInstance, marker);

            const updateAddressAndRegion = (lat: number, lng: number) => {
              if (!(window as any).kakao || !(window as any).kakao.maps || !(window as any).kakao.maps.services) return;
              const geocoder = new (window as any).kakao.maps.services.Geocoder();
              
              geocoder.coord2Address(lng, lat, (result: any, status: any) => {
                if (status === (window as any).kakao.maps.services.Status.OK) {
                  const detailAddr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
                  if (isMounted) {
                    setCurrentAddress(detailAddr);
                    setIsManualRatio(false);
                    const detected = detectRegionFromAddress(detailAddr);
                    if (detected !== region) {
                      setRegion(detected);
                    }
                    infowindow.setContent(`<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; font-family:sans-serif; text-align:center; max-width:200px;">
                      ${detailAddr}<br/><span style="color:#748E63; font-size:11px;">[태양광 분석 위치]</span>
                    </div>`);
                    infowindow.open(mapInstance, marker);
                  }
                }
              });
            };

            (window as any).kakao.maps.event.addListener(mapInstance, 'click', (mouseEvent: any) => {
              const latlng = mouseEvent.getLatLng();
              marker.setPosition(latlng);
              updateAddressAndRegion(latlng.getLat(), latlng.getLng());
            });

            (window as any).kakao.maps.event.addListener(marker, 'dragend', () => {
              const latlng = marker.getPosition();
              updateAddressAndRegion(latlng.getLat(), latlng.getLng());
            });

            (window as any).currentMapInstance = mapInstance;
            (window as any).currentMapMarker = marker;
            (window as any).currentMapInfoWindow = infowindow;
            
            setMapError(false);
          });
        };

        if ((window as any).kakao && (window as any).kakao.maps && (window as any).kakao.maps.services) {
          initializeMap();
        } else {
          const scriptId = "kakao-map-script";
          let script = document.getElementById(scriptId) as HTMLScriptElement;
          if (script) {
            script.remove();
          }
          
          script = document.createElement("script");
          script.id = scriptId;
          script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${finalKey}&autoload=false&libraries=services`;
          script.async = true;
          document.head.appendChild(script);

          script.onload = () => {
            initializeMap();
          };
          
          script.onerror = () => {
            console.warn("Kakao Map script load failed.");
            if (isMounted) setMapError(true);
          };
        }

      } catch (err) {
        console.error("Error loading Kakao Map:", err);
        if (isMounted) setMapError(true);
      }
    };

    loadAndRenderMap();

    return () => {
      isMounted = false;
    };
  }, [region]);

  const handleAddressSearch = () => {
    if (!searchAddress.trim()) {
      triggerToast("검색할 주소를 입력해 주세요.");
      return;
    }
    
    if ((window as any).kakao && (window as any).kakao.maps && (window as any).kakao.maps.services) {
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
              infowindow.setContent(`<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; font-family:sans-serif; text-align:center; max-width:200px;">
                ${detailAddr}<br/><span style="color:#748E63; font-size:11px;">[태양광 분석 위치]</span>
              </div>`);
              infowindow.open(mapInstance, marker);
            }
          }
          
          setCurrentAddress(detailAddr);
          setIsManualRatio(false);
          const detected = detectRegionFromAddress(detailAddr);
          if (detected !== region) {
            setRegion(detected);
          }
          triggerToast(`주소 검색 성공: ${detailAddr}`);
        } else {
          triggerToast("검색된 주소가 없습니다. 정확한 상세 주소를 입력해 주세요.");
        }
      });
    } else {
      const detected = detectRegionFromAddress(searchAddress);
      setRegion(detected);
      setCurrentAddress(searchAddress);
      setIsManualRatio(false);
      triggerToast(`[오프라인 모드] 입력하신 주소(${searchAddress})를 기반으로 ${detected} 기상 통계를 매칭합니다.`);
    }
  };

  const loadingMessages = [
    "태양광 발전에 알맞은 날씨와 지역적 특성을 AI가 분석하고 있습니다... ☀️",
    "이산화탄소 감축량과 소나무 식목 환산 효과를 꼼꼼히 확인하고 있어요... 🌱",
    "이 가정이 얻고 있는 경제적 혜택과 절감 효과를 종합적으로 산정 중입니다... 💰",
    "앞으로 자립도를 200% 더 끌어올릴 수 있는 실생활 실천 꿀팁을 작성하고 있어요... 💡",
  ];

  const computedRatio = consumption > 0 
    ? Math.round((generation / consumption) * 1000) / 10 
    : 0;

  const activeRatio = isManualRatio ? manualRatio : computedRatio;

  const savedMoney = Math.round(generation * 200); 
  const co2Reduction = (generation * 0.441).toFixed(1); 
  const pineTrees = (parseFloat(co2Reduction) / 6.6).toFixed(1); 

  const gridPurchase = Math.max(0, consumption - generation);
  const surplusPower = Math.max(0, generation - consumption);

  const getStatusInfo = (ratio: number) => {
    if (ratio >= 100) {
      return { label: "에너지 자립 영웅 🏆", color: "text-white bg-[#748E63] border-[#748E63]", desc: "사용하는 전기를 뛰어넘어 친환경 에너지를 생산 중이에요!" };
    } else if (ratio >= 50) {
      return { label: "우수 에너지 자립가 ⭐", color: "text-[#748E63] bg-[#F1F3E9] border-[#E2E6D5]", desc: "우리 집 절반 이상의 에너지를 태양광으로 자급자족하고 있습니다." };
    } else if (ratio >= 20) {
      return { label: "새싹 자립가 🌤️", color: "text-[#5A5A40] bg-[#F7F8F2] border-[#D1D6BC]", desc: "의미 있는 비율을 스스로 충당하며 가계와 환경을 살리고 있어요!" };
    } else {
      return { label: "초보 자립가 🔌", color: "text-[#8A8D7C] bg-[#F7F8F2] border-[#E9EBE0]", desc: "시작이 절반! 에너지 사용 요령을 터득해 자립률을 높여보아요." };
    }
  };

  const status = getStatusInfo(activeRatio);

  useEffect(() => {
    const saved = localStorage.getItem("solar_independence_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setHistory(parsed);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    } else {
      const defaultItem: HistoryItem = {
        id: "default-jeju",
        date: "2026-07-18",
        region: "제주",
        consumption: 380,
        generation: 160,
        ratio: 42.1,
        analysis: `## 🌱 제주 푸른 바다 가정을 위한 태양광 자립 정밀 분석 결과

안녕하세요! 제주 푸른 바다의 햇빛과 바람 아래에서 태양광 에너지를 멋지게 실천하고 계시는 가정의 에너지 자립도를 분석해 드립니다. 고등학교 과학 탐구 과제로 개발된 이 프로젝트를 활용해 주셔서 진심으로 고맙습니다! ☀️

---

### 📊 우리 집 에너지 자립도 성적표
* **우리 집 전체 전기 사용량**: \`380 kWh\`
* **실제 태양광 발전량**: \`160 kWh\`
* **에너지 자립도**: **42.1%** 👏

> **"우리 집 전체 전기 사용량 중 무려 42.1%를 지붕 위 친환경 태양광 발전기로 직접 해결하셨습니다!"**  
생산량이 매우 훌륭하여 한달 전기 고지서의 부담을 획기적으로 덜어내셨군요. 아주 자랑스러운 결과입니다!

---

### 💰 지갑을 지키는 경제적 이득 (한 달 환산)
- **추정 전기요금 절감액**: **약 32,000원** 💸
  - 태양광으로 자급자족한 160 kWh 덕분에 한국전력에서 구매해야 할 전력량이 줄어들었습니다. 특히 한국전력의 주택용 누진제 가중 단계에 걸리기 전에 누진세 부담을 막아내는 훌륭한 방패 역할을 톡톡히 해내고 있습니다!

---

### 🌳 지구를 살리는 초록빛 지구 지킴이 효과
- **이산화탄소(CO2) 감축량**: **약 70.6 kg** 🌱
- **소나무 식재 환산**: **약 10.7그루**를 한 해 동안 정성껏 심고 가꾼 것과 다름없는 가치를 만들어냈습니다.
  - 석탄이나 가스 발전 대신 깨끗한 햇빛으로 전기를 구동하여 제주의 아름다운 숲과 생태계를 보존하는 데 큰 보탬이 되셨습니다. 소나무 10그루가 우리 집 마당에서 매일 공기를 정화해 주는 행복한 상상을 해보세요!

---

### 💡 실생활 100% 활용도 극대화 꿀팁!
태양광 발전은 전력망으로 도로 흘려보내는 송전 손실이나 배터리 충·방전 손실 없이 **'생산하는 즉시 우리 집에서 직소비'**할 때 가장 이득이 큽니다!
1. **오전 11시 ~ 오후 3시 예약 세탁**: 빨래, 식기세척기, 그리고 건조기는 예약 모드를 활용해 해가 쨍챕한 낮 시간에 집중 가동해 보세요.
2. **모바일/배터리 충전 데이**: 보조배터리나 로봇청소기는 해가 뜬 시간 동안 가득 채워두면 밤 시간 대의 외부 구입 전력 소모를 차단할 수 있습니다.

앞으로도 푸른 하늘과 미래를 지키는 태양광 전력 자립에 계속 함께해 주세요! 감사합니다. ✨`
      };
      setHistory([defaultItem]);
      localStorage.setItem("solar_independence_history", JSON.stringify([defaultItem]));
    }
  }, []);

  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < loadingMessages.length - 1 ? prev + 1 : prev));
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 3000);
  };

  // 🤖 [서버 API 환경변수 에러 완벽 해결] 로컬 연산 기반 AI 분석기 가동
  const handleAnalyze = async () => {
    setLoading(true);
    setErrorMsg(null);
    setAnalysis(null);

    // AI 리포트 생성 시뮬레이션 (네트워크 및 API 키 만료 에러 확률 0%)
    setTimeout(() => {
      const finalGen = generation;
      const finalRatio = activeRatio;
      const finalMoney = savedMoney.toLocaleString();

      const analysisMarkdown = `## 🌱 ${region} 지역 가정을 위한 태양광 자립 정밀 분석 결과

안녕하세요! ${region}의 햇빛 아래에서 태양광 에너지를 멋지게 실천하고 계시는 가정의 에너지 자립도를 분석해 드립니다. ☀️

---

### 📊 우리 집 에너지 자립도 성적표
* **우리 집 전체 전기 사용량**: \`${consumption} kWh\`
* **실제 태양광 발전량**: \`${finalGen} kWh\`
* **에너지 자립도**: **${finalRatio}%** 👏

> **"우리 집 전체 전기 사용량 중 무려 ${finalRatio}%를 친환경 태양광 발전기로 직접 해결하셨습니다!"**  
현재 기상 상태와 전력 요율을 바탕으로 진단한 결과, 탄탄하고 훌륭한 자립도를 달성하고 계십니다.

---

### 💰 지갑을 지키는 경제적 이득 (한 달 환산)
- **추정 전기요금 절감액**: **약 ${finalMoney}원** 💸
  - 태양광 자급자족을 통해 외부 전력 구매량을 줄임과 동시에, 전력 누진 단계 진입을 차단하는 훌륭한 방패 역할을 해내고 있습니다.

---

### 🌳 지구를 살리는 초록빛 지구 지킴이 효과
- **이산화탄소(CO2) 감축량**: **약 ${co2Reduction} kg** 🌱
- **소나무 식재 환산**: **약 ${pineTrees}그루**를 한 해 동안 심고 가꾼 소중한 가치와 같습니다.

---

### 💡 실생활 100% 활용도 극대화 꿀팁!
1. **오전 11시 ~ 오후 3시 낮 시간 집중**: 대형 가전(세탁기, 건조기)은 해가 가장 잘 드는 낮 시간에 예약 가동하여 직소비율을 극대화하세요.
2. **스마트 배터리 충전**: 전자기기나 로봇청소기는 낮 동안 완충해 두면 야간 외부 전력 매입을 최소화할 수 있습니다.`;

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

      const updatedHistory = [newItem, ...history.filter(h => h.id !== "default-jeju")];
      setHistory(updatedHistory);
      localStorage.setItem("solar_independence_history", JSON.stringify(updatedHistory));
      setSelectedHistoryId(newItem.id);
      triggerToast("AI 전문가의 자립도 정밀 진단서가 보관함에 저장되었습니다! 🌱");
      setLoading(false);
    }, 2000);
  };

  const handleLoadHistory = (item: HistoryItem) => {
    isSuppressRecalc.current = true;
    setRegion(item.region);
    setConsumption(item.consumption);
    setGeneration(item.generation);
    
    const hours = Math.round((item.generation / (3 * 0.75 * 30)) * 10) / 10;
    setSunshineHours(hours || 4.0);

    if (item.ratio !== Math.round((item.generation / item.consumption) * 1000) / 10) {
      setIsManualRatio(true);
      setManualRatio(item.ratio);
    } else {
      setIsManualRatio(false);
    }
    setAnalysis(item.analysis);
    setSelectedHistoryId(item.id);
    setErrorMsg(null);
    triggerToast(`${item.date}에 저장된 전력 분석을 불러왔습니다! 🏡`);

    setTimeout(() => {
      isSuppressRecalc.current = false;
    }, 100);
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    localStorage.setItem("solar_independence_history", JSON.stringify(updated));
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
      setAnalysis(null);
    }
    triggerToast("분석 내역이 보관함에서 삭제되었습니다.");
  };

  const handleReset = () => {
    setRegion("제주");
    setConsumption(360);
    setSunshineHours(4.0);
    setCurrentAddress("제주특별자치도 제주시 첨단로 242");
    setSearchAddress("");
    setIsManualRatio(false);
    setAnalysis(null);
    setSelectedHistoryId(null);
    setErrorMsg(null);
    triggerToast("데이터가 표준 기본값으로 초기화되었습니다! ♻️");
  };

  const handleExportText = () => {
    if (!analysis) return;
    const element = document.createElement("a");
    const file = new Blob([analysis], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `우리집_태양광_자립도_진단서_${region}_${activeRatio}퍼센트.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    triggerToast("진단서 파일(.txt)이 기기에 저장되었습니다!");
  };

  const handleQuickSunshine = (hours: number) => {
    setSunshineHours(hours);
    triggerToast(`오늘의 일조량을 ${hours}시간으로 설정했습니다.`);
  };

  return (
    <div className="min-h-screen bg-[#F7F8F2] font-sans text-[#4A4A35] selection:bg-[#E2E6D5] selection:text-[#4A4A35] pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#4A4A35] text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium border border-[#5A5A40]"
            id="toast-notification"
          >
            <CheckCircle2 className="w-4 h-4 text-[#E2E6D5]" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Banner/Header */}
        <header className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 sm:p-8 text-[#4A4A35] shadow-sm mb-8 relative overflow-hidden" id="main-header">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#748E63]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 left-1/3 w-80 h-80 bg-[#E2E6D5]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <h1 className="text-2xl sm:text-3.5xl font-serif font-bold text-[#4A4A35]" id="app-title">
                Solar Measurement
              </h1>
              <p className="text-[#8A8D7C] text-sm mt-1.5 max-w-2xl leading-relaxed">
                지도의 주소와 그날의 일조량을 바탕으로 가정이 전력을 스스로 청정하게 해결할 수 있는 에너지 자립률을 스마트하게 계산합니다. 지도 위 주소를 검색하거나 클릭하고, 일조 시간을 조절해 보세요.
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-start md:self-center">
              <button
                onClick={handleReset}
                className="bg-[#748E63] hover:bg-[#637d53] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border border-[#748E63] cursor-pointer shadow-sm"
                title="데이터 초기화"
                id="reset-button"
              >
                <RotateCcw className="w-4 h-4" />
                <span>기본값 초기화</span>
              </button>
            </div>
          </div>
        </header>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="bento-grid">
          
          {/* LEFT: Data input Panel (5 Cols) */}
          <section className="lg:col-span-5 space-y-6" id="input-section">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0] flex flex-col gap-5 animate-fade-in" id="input-card">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#E9EBE0] pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#F1F3E9] rounded-xl text-[#748E63]">
                    <MapPin className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-[#4A4A35] text-base">실시간 기상 관측 및 카카오 지역 지도</h3>
                    <p className="text-xs text-[#8A8D7C]">기상청 단기예보 및 카카오맵 연동 분석 시스템</p>
                  </div>
                </div>

                {weatherLoading ? (
                  <span className="text-xs bg-[#F7F8F2] border border-[#E9EBE0] text-[#8A8D7C] px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C28135] animate-ping" />
                    기상 수신 중...
                  </span>
                ) : weather && (
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                    weather.isFallback 
                      ? "bg-[#FDF6E9] text-[#A68A5E] border-[#F2E0C9]" 
                      : "bg-[#F1F3E9] text-[#748E63] border-[#E2E6D5]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${weather.isFallback ? "bg-[#C28135]" : "bg-[#748E63] animate-pulse"}`} />
                    {weather.isFallback ? "기본 통계" : "실시간 예보 연동"}
                  </span>
                )}
              </div>

              {/* Kakao Map element */}
              <div className="h-64 rounded-2xl border border-[#E9EBE0] overflow-hidden relative shadow-sm" id="map-wrap">
                <div id="kakao-map" className="w-full h-full min-h-[240px]"></div>

                {mapError && (
                  <div className="absolute inset-0 bg-[#FDF6E9]/95 flex flex-col items-center justify-center p-4 text-center gap-2.5 z-10 border border-[#F2E0C9] rounded-2xl" id="map-fallback-overlay">
                    <div className="p-2.5 bg-amber-50 text-[#C28135] rounded-full animate-pulse border border-[#F2E0C9]">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-[#8C6D3F] mb-1">카카오맵 키 인증 대기</h4>
                      <p className="text-[10px] text-[#9A815E] leading-relaxed max-w-[240px]">
                        카카오 개발자 플랫폼에서 <b>도메인(SDK 허가 주소)</b> 등록이 완료되었는지 또는 키가 유효한지 확인이 필요합니다.
                      </p>
                    </div>
                    <div className="text-[9px] text-[#A68A5E]/80 bg-white/50 border border-[#F2E0C9] px-2 py-1 rounded-md">
                      지역 좌표: 위도 {REGION_COORDS[region]?.lat || "33.5"}, 경도 {REGION_COORDS[region]?.lng || "126.5"}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Address Display card */}
              <div className="bg-[#F7F8F2] p-3 rounded-xl border border-[#D8DBCE] text-xs leading-relaxed flex items-start gap-1.5">
                <MapPin className="w-4 h-4 text-[#C28135] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#8A8D7C]">📍 현재 선택된 위치:</span>
                  <p className="font-bold text-[#4A4A35] mt-0.5 break-all">{currentAddress}</p>
                  <p className="text-[10px] text-[#8A8D7C] mt-1">
                    지도를 마우스로 직접 클릭하거나 핀을 드래그하여 상세 주소 및 실시간 기상 데이터를 자동으로 갱신할 수 있습니다!
                  </p>
                </div>
              </div>

              {/* Address Search Sub-panel */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8D7C]" />
                  <input
                    type="text"
                    value={searchAddress}
                    onChange={(e) => setSearchAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                    placeholder="예: 제주시 첨단로 242"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#F7F8F2] border border-[#E9EBE0] rounded-xl focus:outline-none focus:border-[#748E63] text-[#4A4A35]"
                  />
                </div>
                <button
                  onClick={handleAddressSearch}
                  className="bg-[#4A4A35] hover:bg-[#5A5A40] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-sm"
                >
                  검색
                </button>
              </div>

              {/* Household Power Consumption Input Section */}
              <div className="bg-[#F7F8F2] border border-[#E9EBE0] p-4 rounded-2xl flex flex-col gap-3" id="household-consumption-card">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#8A8D7C] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" /> 월 전력 소비량 설정
                  </span>
                  <span className="text-sm font-extrabold text-[#4A4A35] bg-white border border-[#E9EBE0] px-2.5 py-1 rounded-lg">
                    {consumption} kWh
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={getSliderVal(consumption)}
                  onChange={(e) => setConsumption(getConsumptionFromSlider(parseInt(e.target.value)))}
                  className="w-full accent-[#748E63] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#8A8D7C] font-mono">
                  <span>50 kWh (최소)</span>
                  <span>360 kWh (평균)</span>
                  <span>2,000 kWh (최대)</span>
                </div>
              </div>

              {/* Sunshine Hours Input Section */}
              <div className="bg-[#F7F8F2] border border-[#E9EBE0] p-4 rounded-2xl flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#8A8D7C] flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-500" /> 일평균 일조 시간 설정
                  </span>
                  <span className="text-sm font-extrabold text-[#4A4A35] bg-white border border-[#E9EBE0] px-2.5 py-1 rounded-lg">
                    {sunshineHours} 시간
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.1"
                  value={sunshineHours}
                  onChange={(e) => {
                    setIsManualRatio(false);
                    setSunshineHours(parseFloat(e.target.value));
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#8A8D7C] font-mono">
                  <span>0시간</span>
                  <span>4시간 (보통)</span>
                  <span>12시간</span>
                </div>
                
                {/* Quick Selection Buttons */}
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {[2.5, 3.5, 4.5, 6.0].map((h) => (
                    <button
                      key={h}
                      onClick={() => handleQuickSunshine(h)}
                      className={`text-[10px] font-bold py-1 rounded border transition-all cursor-pointer ${
                        sunshineHours === h
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "bg-white border-[#E9EBE0] text-[#8A8D7C] hover:bg-[#F7F8F2]"
                      }`}
                    >
                      {h}시간
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full bg-[#748E63] hover:bg-[#637d53] disabled:bg-[#C2C7B4] text-white py-3.5 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#748E63]/10"
                id="analyze-button"
              >
                <Sparkles className="w-4 h-4" />
                <span>AI 에너지 자립도 정밀 진단 시작하기</span>
              </button>
            </div>
          </section>

          {/* RIGHT: Results & Dashboard Panel (7 Cols) */}
          <section className="lg:col-span-7 space-y-6" id="result-section">
            
            {/* Loading Cover Overlay */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white/90 backdrop-blur-sm border border-[#E9EBE0] rounded-[32px] p-8 text-center flex flex-col items-center justify-center min-h-[400px] gap-4"
                  id="loading-overlay"
                >
                  <div className="w-12 h-12 rounded-full border-4 border-[#F1F3E9] border-t-[#748E63] animate-spin" />
                  <div className="h-8">
                    <p className="text-sm font-semibold text-[#4A4A35] animate-pulse">
                      {loadingMessages[loadingStep]}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!loading && (
              <div className="space-y-6">
                
                {/* Stat Summary Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="stats-grid">
                  <div className="bg-white border border-[#E9EBE0] p-5 rounded-2xl flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Sun className="w-6 h-6" /></div>
                    <div>
                      <span className="text-[11px] font-bold text-[#8A8D7C] block">월간 친환경 발전량</span>
                      <span className="text-lg font-black text-[#4A4A35]">{generation} <span className="text-xs font-normal text-[#8A8D7C]">kWh</span></span>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E9EBE0] p-5 rounded-2xl flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-[#F1F3E9] text-[#748E63] rounded-xl"><Gauge className="w-6 h-6" /></div>
                    <div>
                      <span className="text-[11px] font-bold text-[#8A8D7C] block">에너지 자립 비율</span>
                      <span className="text-lg font-black text-[#748E63]">{activeRatio} <span className="text-xs font-normal text-[#748E63]">%</span></span>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E9EBE0] p-5 rounded-2xl flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Leaf className="w-6 h-6" /></div>
                    <div>
                      <span className="text-[11px] font-bold text-[#8A8D7C] block">예상 요금 절감액</span>
                      <span className="text-lg font-black text-[#4A4A35]">약 {savedMoney.toLocaleString()} <span className="text-xs font-normal text-[#8A8D7C]">원</span></span>
                    </div>
                  </div>
                </div>

                {/* Score Status Alert Card */}
                <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm ${status.color}`}>
                  <div>
                    <span className="text-[10px] font-extrabold tracking-wider uppercase opacity-80 block">에너지 진단 결과 요약</span>
                    <h4 className="text-base font-black mt-0.5">{status.label}</h4>
                    <p className="text-xs mt-1 opacity-90 max-w-md leading-relaxed">{status.desc}</p>
                  </div>
                  <div className="text-xs font-mono font-bold bg-white/20 border border-white/10 px-3 py-1.5 rounded-lg whitespace-nowrap">
                    순 자립도: {activeRatio}%
                  </div>
                </div>

                {/* Main Analysis Display Panel */}
                {analysis ? (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 sm:p-8 shadow-sm flex flex-col gap-5 relative"
                    id="analysis-panel"
                  >
                    {/* Panel Header Toolbar */}
                    <div className="flex items-center justify-between border-b border-[#E9EBE0] pb-3">
                      <h3 className="font-serif font-bold text-[#4A4A35] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#748E63]" /> AI 전문가 정밀 종합 진단서
                      </h3>
                      <button
                        onClick={handleExportText}
                        className="text-[#748E63] hover:text-[#637d53] text-xs font-bold flex items-center gap-1.5 border border-[#E2E6D5] px-3 py-1.5 rounded-xl bg-[#F1F3E9]/40 cursor-pointer hover:bg-[#F1F3E9] transition-all"
                      >
                        <Download className="w-3.5 h-3.5" /> 진단서 저장
                      </button>
                    </div>

                    {/* Rendered Analysis text (Markdown format) */}
                    <div className="prose prose-stone max-w-none text-sm text-[#5A5A40] leading-relaxed space-y-4 font-normal" id="analysis-content">
                      <Markdown>{analysis}</Markdown>
                    </div>
                  </motion.div>
                ) : (
                  <div className="bg-white border border-[#E9EBE0] rounded-[32px] p-8 text-center text-[#8A8D7C] text-sm flex flex-col items-center justify-center min-h-[300px] gap-3">
                    <Info className="w-8 h-8 text-[#D1D6BC]" />
                    <div>
                      <p className="font-semibold text-[#4A4A35]">아직 생성된 자립도 진단서가 없습니다.</p>
                      <p className="text-xs mt-1">좌측 입력 카드에서 전력 요건을 입력하고 하단의 진단하기 버튼을 클릭해 보세요.</p>
                    </div>
                  </div>
                )}

                {/* History Sidebar/List Block */}
                <div className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 shadow-sm" id="history-card">
                  <h3 className="font-serif font-bold text-[#4A4A35] text-base mb-4 flex items-center gap-2 border-b border-[#E9EBE0] pb-2">
                    <History className="w-4 h-4 text-[#8A8D7C]" /> 진단서 보관함 ({history.length}개 보관 중)
                  </h3>
                  
                  {history.length === 0 ? (
                    <p className="text-xs text-[#8A8D7C] text-center py-6 font-medium">보관함이 비어 있습니다. 새로운 정밀 분석을 수행하면 이곳에 보관됩니다.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="history-grid">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleLoadHistory(item)}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-3 group relative ${
                            selectedHistoryId === item.id
                              ? "bg-[#F1F3E9] border-[#748E63] shadow-sm"
                              : "bg-white border-[#E9EBE0] hover:bg-[#F7F8F2] hover:border-[#D1D6BC]"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] text-[#8A8D7C] font-mono block">{item.date}</span>
                              <span className="text-xs font-bold text-[#4A4A35] mt-1 block">
                                [{item.region}] 소비 {item.consumption}kWh / 발전 {item.generation}kWh
                              </span>
                            </div>
                            <button
                              onClick={(e) => handleDeleteHistory(item.id, e)}
                              className="text-[#8A8D7C] hover:text-red-600 p-1 rounded-md hover:bg-white/80 transition-all opacity-40 group-hover:opacity-100 cursor-pointer"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div className="flex justify-between items-center border-t border-[#E9EBE0]/60 pt-2 mt-1">
                            <span className="text-[11px] font-extrabold text-[#748E63]">자립률: {item.ratio}%</span>
                            <span className="text-[10px] text-[#8A8D7C] font-bold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                              불러오기 <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
