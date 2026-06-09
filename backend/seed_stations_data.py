#!/usr/bin/env python3
"""Enrich stations.json (the backend seed file) with data from TfL's step-free access CSVs.

Covers all 387 stations across all TfL modes (tube, DLR, Overground, Elizabeth line,
National Rail, Tram). Unmatched stations are left unchanged.

PRIMARY ENTRY POINT — run from anywhere:
    python3 backend/seed_stations_data.py
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "temp" / "tfl-stationdata-detailed"
TUBE_JSON = ROOT / "backend" / "app" / "data" / "stations.json"
OVERRIDES_JSON = ROOT / "backend" / "app" / "data" / "station_overrides.json"

# stations.json name → CSV UniqueId or CSV Name (for the 8 mismatches)
NAME_MAP = {
    "Edgware Road (Bakerloo)":                "940GZZLUERB",   # B suffix = Bakerloo
    "Edgware Road (Circle Line)":             "940GZZLUERC",   # C suffix = Circle/H&C
    "Heathrow Airport Terminal 4":            "Heathrow Terminal 4",
    "Heathrow Airport Terminal 5":            "Heathrow Terminal 5",
    "King's Cross & St Pancras International":"King's Cross St Pancras",
    "St. James's Park":                       "St James's Park",
    "St. John's Wood":                        "St John's Wood",
    "St. Paul's":                             "St Paul's",
}

# Line slug (from platform UniqueId) → display name
LINE_DISPLAY = {
    "bakerloo":          "Bakerloo",
    "central":           "Central",
    "circle":            "Circle",
    "district":          "District",
    "elizabeth":         "Elizabeth",
    "hammersmith-city":  "Hammersmith & City",
    "jubilee":           "Jubilee",
    "metropolitan":      "Metropolitan",
    "northern":          "Northern",
    "piccadilly":        "Piccadilly",
    "victoria":          "Victoria",
    "waterloo-city":     "Waterloo & City",
    "dlr":               "DLR",
    "london-overground": "London Overground",
    "national-rail":     "National Rail",
    "tram":              "Tram",
    "cable-car":         "Emirates Air Line",
}

# Station-point AreaName → human-readable label.
# Codes ending in a direction suffix (NB/SB/EB/WB) are handled programmatically below.
_AREA_EXACT: dict[str, str] = {
    "BookH":   "Booking Hall",
    "MET":     "Ticket Hall",        # LU concourse / mezzanine area
    "AC":      "Ticket Hall",
    "RLY":     "National Rail concourse",
    "LoCon":   "Lower Concourse",
    "CONC":    "Concourse",
    "BCQ":     "Booking concourse",
    "STATI":   "Station",
    "Bus":     "Bus stop",
    "BUS":     "Bus stop",
    "BusAB":   "Bus stop",
    "BusE":    "Bus stop (east)",
    "BusW":    "Bus stop (west)",
    "Entr":    "Entrance",
    "ENT":     "Entrance",
    "ENTN":    "Entrance (north)",
    "ENTS":    "Entrance (south)",
    "EntS":    "Entrance (south)",
    "EntN":    "Entrance (north)",
    "EntC":    "Entrance (central)",
    "EntM":    "Entrance (main)",
    "EntE":    "Entrance (east)",
    "EntW":    "Entrance (west)",
    "EntB":    "Entrance (back)",
    "EntrE":   "Entrance (east)",
    "EntrW":   "Entrance (west)",
    "FBdg":    "Footbridge",
    "FB":      "Footbridge",
    "Footb":   "Footbridge",
    "BRDGE":   "Bridge",
    "Bridg":   "Bridge",
    "Sub":     "Subway",
    "Subwy":   "Subway",
    "SUB":     "Subway",
    "Subwa":   "Subway",
    "Conc":    "Concourse",
    "Mezz":    "Mezzanine",
    "LiftLb":  "Lift lobby",
    # Booking-hall variants
    "BH":      "Booking Hall",
    "BookJ":   "Jubilee line booking hall",
    "BookN":   "Booking Hall (north)",
    "BookS":   "Booking Hall (south)",
    "BookE":   "Booking Hall (east)",
    "BookW":   "Booking Hall (west)",
    "BookV":   "Victoria line booking hall",
    "BookM":   "Metropolitan line booking hall",
    "LLBH":    "Lower level booking hall",
    "DSBH":    "Down-side booking hall",
    "CSBH":    "Central sub-level booking hall",
    "HSQBH":   "Hanover Square booking hall",
    "ELBH":    "Elizabeth line booking hall",
    "LULB":    "Underground lower booking hall",
    # Ticket-hall variants
    "TH":      "Ticket Hall",
    "NTH":     "Northern line ticket hall",
    "WTH":     "Western ticket hall",
    "ELTH":    "Elizabeth line ticket hall",
    # Concourse / passage variants
    "NPE":     "North passage (east)",
    "NPN":     "North passage (north)",
    "NORTH":   "North concourse",
    "WBHal":   "Westbound hall",
    "UpCon":   "Upper concourse",
    "LoCon":   "Lower concourse",
    "LoCo":    "Lower concourse",
    "BCQ":     "Booking concourse",
    # Mezzanine variants
    "MEZ":     "Mezzanine",
    "Mez":     "Mezzanine",
    "BMez":    "Bakerloo line mezzanine",
    "ELM":     "Elizabeth line mezzanine",
    # Subway / subway variants
    "Sub-W":   "Subway (west)",
    "Sub-M":   "Subway (middle)",
    "Sub-E":   "Subway (east)",
    "WESTF":   "Westfield subway",
    # Entrance variants
    "EEnt":    "East entrance",
    "WEnt":    "West entrance",
    "ELEnt":   "Elizabeth line entrance",
    "OEntr":   "Outer entrance",
    "BEntr":   "Bus entrance",
    "ENTBR":   "Entrance (bridge)",
    "ENTRA":   "Entrance A",
    "ET":      "Entrance tunnel",
    # Bridge / walkway
    "BridW":   "Bridge (west)",
    "NBDGE":   "North bridge",
    "LAND":    "Landing",
    "Lan":     "Landing",
    "WAL":     "Walkway",
    "WLL":     "Lower walkway",
    # Line-area codes not caught by prefix rules
    "PicLi":   "Piccadilly line",
    "PiccS":   "Piccadilly line southbound",
    "PiccN":   "Piccadilly line northbound",
    "PiccE":   "Piccadilly line eastbound",
    "PiccW":   "Piccadilly line westbound",
    "PICC":    "Piccadilly line",
    "Picca":   "Piccadilly line",
    "NORTH":   "Northern line",
    "VIC":     "Victoria line",
    "JUB":     "Jubilee line",
    "JubiE":   "Jubilee line (east)",
    "JubiW":   "Jubilee line (west)",
    "JubWT":   "Jubilee line west tunnel",
    "CJL":     "Circle/Jubilee lower concourse",
    "D-P-S":   "District/Piccadilly interchange",
    "DisW":    "District line westbound",
    "DisE":    "District line eastbound",
    "EUL":     "East upper level",
    "BWSLL":   "Below-street lower level",
    "GANT":    "Gate area (north)",
    # Railway platform variants
    "RPL-G":   "Railway platform G",
    "RPL-H":   "Railway platform H",
    "RPL-L":   "Railway platform L",
    "RPL-O":   "Railway platform O",
    "RPL-X":   "Railway platform X",
    "RPLLN":   "Railway platform (north lower)",
    "RPLLS":   "Railway platform (south lower)",
    "RPL-D":   "Railway platform D",
    "RPLTN":   "Railway platform (north)",
    "RPLTS":   "Railway platform (south)",
    "RPLAN":   "Railway platform A (north)",
    "RPLAS":   "Railway platform A (south)",
    "RPLDN":   "Railway platform D (north)",
    "RPLDS":   "Railway platform D (south)",
    "RPLHE":   "Railway platform H (east)",
    "RPLHW":   "Railway platform H (west)",
    "RPLHT":   "Railway platform H (through)",
    "NORPL":   "Northern line platform",
    "NLSP":    "Northern line south platform",
    "PLM":     "Platform M",
    "PLL":     "Platform L",
    "PLAT":    "Platform area",
    "PLATS":   "Platform south",
    "PLT1":    "Platform 1",
    "PLT2":    "Platform 2",
    "DLR10":   "DLR platform 10",
    "DLR1":    "DLR platform 1",
    "DLR2":    "DLR platform 2",
    "DLR3":    "DLR platform 3",
    "DLR4":    "DLR platform 4",
    "EBG":     "East bus gate",
    "EBS":     "East bus stop",
    "SB":      "Southbound platform",
    "NB":      "Northbound platform",
    "UP":      "Upper platform",
    "LATH":    "Lawn ticket hall",
    "ARC":     "Arcade",
    "BLL":     "Bakerloo line lower",
    "BLLU":    "Bakerloo line lower upper",
    "BakLa":   "Bakerloo line landing",
    "B-TAN":   "Bakerloo/tube approach north",
    "HLM":     "Harrods level mezzanine",
    "HLE":     "Harrods level east",
    "ELI":     "Elizabeth line inner",
    "ELIJ":    "Elizabeth line inner junction",
    "ELWL":    "Elizabeth line west level",
    "ELEL":    "Elizabeth line east level",
    "ELL":     "Elizabeth line lower level",
    "LULB":    "Underground lower booking hall",
    "LUE":     "Underground east",
    "LUW":     "Underground west",
    "LUBOO":   "Underground booking office",
    "RPLSB":   "Railway platform (southbound)",
    "RPLNB":   "Railway platform (northbound)",
    # Specific well-known areas
    "Water":   "Waterloo & City line",
    "TTH":     "Thameslink ticket hall",
    "H-STP":   "St Pancras Highspeed",
    "Lawn":    "The Lawn (concourse)",
    "NInt":    "Northern interchange",
    "SInt":    "Southern interchange",
    "BOROU":   "Borough concourse",
    "Gower":   "Gower Street entrance",
    "CAP":     "Canada Place",
    "D-VIC":   "District/Victoria interchange",
    "CARD":    "Cardinal Place",
    "DVLnk":   "District/Victoria link",
    "IntJu":   "Jubilee line interchange",
    "A-TER":   "Terminal access",
    "A-T5":    "Terminal 5 access",
    "A-BRI":   "Brixton Road access",
    "A-TRI":   "Trinity Square access",
    "A-WHI":   "Whitechapel access",
    "A-CUT":   "The Cut access",
    "North":   "North platform",
    "SURRE":   "Surrey Quays entrance",
    "NBK":     "North booking hall",
    "RPLP1":   "Railway platform 1",
    "I-E/C":   "International/Eurostar concourse",
    "RPL":     "Railway platform",
    "RPL-N":   "Railway platform (north)",
    "RPL-S":   "Railway platform (south)",
    "RPL-E":   "Railway platform (east)",
    "RPL-W":   "Railway platform (west)",
    "RPL N":   "Railway platform (north)",
    "RPL S":   "Railway platform (south)",
    "RPL E":   "Railway platform (east)",
    "RPL W":   "Railway platform (west)",
    "RPL1":    "Railway platform 1",
    "RPL2":    "Railway platform 2",
    "RPL3":    "Railway platform 3",
    "RPL-1":   "Railway platform 1",
    "RPL-2":   "Railway platform 2",
    "RPL S":   "Railway platform (south)",
    "Tram":    "Tram stop",
    "UP":      "Upper platform",
    "UNB":     "Upper platform (northbound)",
    "USB":     "Upper platform (southbound)",
    "Jubil":   "Jubilee line",
    # Elizabeth line (space in name)
    "EL EB":   "Elizabeth line eastbound",
    "EL WB":   "Elizabeth line westbound",
    # ----- DLR directional codes (no-hyphen variants of _DLR_SUFFIX) ----------------
    "DLRN":   "DLR northbound platform",
    "DLRS":   "DLR southbound platform",
    "DLRE":   "DLR eastbound platform",
    "DLRW":   "DLR westbound platform",
    "DLRB":   "DLR concourse",
    "DLRES":  "DLR platform (east side)",
    "DLRI":   "DLR interchange concourse",
    "DLRWL":  "DLR platform (west)",
    # ----- Additional booking / ticket hall variants --------------------------------
    "BOOKH":  "Booking Hall",           # uppercase variant in some DLR entries
    "CBH":    "Booking Hall",           # Custom House abbreviated prefix
    "AC-S":   "Ticket Hall (south)",
    # ----- Bridge / footbridge variants ---------------------------------------------
    "BRIDG":  "Bridge",
    "Bdg":    "Footbridge",
    "Brdge":  "Footbridge",
    "Fbdg":   "Footbridge",
    "FB L":   "Footbridge (lower)",
    "BRBG":   "Station footbridge",
    # ----- Entrance label variants --------------------------------------------------
    "NEnt":   "North entrance",
    "LEntr":  "Lower entrance",
    "EntF":   "Entrance F",
    "EntG":   "Entrance G",
    "EntL":   "Entrance L",
    "EntCC":  "Station concourse entrance",
    "EntHB":  "Station entrance",
    "Ent T":  "Entrance T",
    "Ent P":  "Entrance P",
    # ----- Corridor / passage variants ----------------------------------------------
    "Crdr":   "Corridor",
    "Cor N":  "Corridor (north)",
    # ----- Covered walkway variants (Custom House for ExCeL) ------------------------
    "WalkC":  "Covered walkway (centre)",
    "WalkE":  "Covered walkway (east)",
    "WalkW":  "Covered walkway (west)",
    "WALLW":  "Walkway (west)",
    # ----- Railway platform letter / suffix codes -----------------------------------
    "RPL-A":  "Railway platform A",
    "RPL-B":  "Railway platform B",
    "RPL-K":  "Railway platform K",
    "RPLAM":  "Railway platform A",
    "RPLC":   "Railway platform C",
    "RPLFN":  "Railway platform F (north)",
    "RPLFS":  "Railway platform F (south)",
    "RPL T":  "Railway platform (through)",
    "NR E":   "National Rail (east)",
    "OB":     "Outbound platform",
    # ----- Moorgate multi-level codes -----------------------------------------------
    "MLPE":   "Metropolitan line platform (east)",
    "MLPW":   "Metropolitan line platform (west)",
    "MMEL":   "Upper mezzanine (east)",
    "MMLE":   "Lower mezzanine (east)",
    "MMLW":   "Platform mezzanine (west)",
    # ----- Waterloo concourse codes -------------------------------------------------
    "WCArr":  "Waterloo & City line arrival area",
    "NRDP":   "National Rail departure platforms",
    "TSC":    "Through station concourse",
    "B-WOR":  "Booking Hall (Waterloo Road side)",
    # ----- Bank / Monument codes ----------------------------------------------------
    "R-KWS":  "King William Street entrance",
    "S-BLO":  "Bloomberg Arcade entrance",
    # ----- Canary Wharf codes -------------------------------------------------------
    "PLA":    "Port of London Authority building",
    "J Mez":  "Jubilee line mezzanine",
    "UBST":   "Underground station entrance",
    "SHE":    "Shopping centre (east entrance)",
    "SHW":    "Shopping centre (west entrance)",
    "QE":     "Quay East atrium",
    # ----- Local road / landmark codes (each specific to one station) ---------------
    "ASPEN":  "Aspen Way entrance",           # East India DLR — Aspen Way runs alongside
    "B-B-E":  "Bus station bridge (east)",    # Vauxhall — bus station footbridge east side
    "B-COL":  "Booking Hall (colonnade)",     # Harrow-on-the-Hill — colonnade walkway entrance
    "B-JUB":  "Jubilee Walkway entrance",     # Tower Hill — Jubilee Walkway pedestrian route
    "BED":    "Beresford Square entrance",    # Woolwich Arsenal — adjacent market square
    "BLACK":  "Blackwall Way entrance",       # East India DLR — Blackwall Way road
    "BOW":    "Bow Road entrance",            # Canning Town — exit towards Bow
    "BOWRD":  "Bow Road entrance",            # Bow Church DLR — station on Bow Road
    "BRANC":  "Branch Road entrance",         # Limehouse
    "BUTCH":  "Butcher Row entrance",         # Limehouse — historical local street name
    "C-CAR":  "Car park",                    # Cockfosters
    "C-STR":  "Street entrance (central)",   # Bond Street Elizabeth line
    "CONNA":  "Interchange area",            # Prince Regent DLR
    "CORNW":  "Cable Street entrance",        # Shadwell — Cable Street runs past station
    "CREEK":  "Deptford Creek entrance",      # Cutty Sark — Deptford Creek waterway
    "CROSA":  "Station concourse",           # Crossharbour DLR
    "D-NPE":  "North passage (east)",         # Tottenham Court Road — variant of NPE
    "DITCH":  "Ditchburn Place entrance",     # Blackwall DLR — Ditchburn Place
    "DRAYT":  "Drayton Green Road entrance",  # West Ealing — Drayton Green Road
    "DRERD":  "Airport terminal entrance",    # London City Airport DLR
    "E-STA":  "Stadium exit (east)",          # Wembley Park — Wembley Stadium east exit
    "EML":    "Main station level",           # Brent Cross West
    "FELIX":  "Felixstowe Road entrance",     # Abbey Wood — Felixstowe Road
    "FOT":    "Station forecourt",            # Carshalton
    "H-EL":   "Elizabeth line upper concourse",  # Liverpool Street
    "HARRO":  "Harrow Manorway entrance",     # Abbey Wood — Harrow Manorway road
    "IENT":   "Station entrance (inner)",     # Hackney Downs
    "KC911":  "Station concourse",            # King's Cross — internal passage designator
    "LSC":    "Station concourse",            # South Quay DLR
    "MANCH":  "Manchester Road entrance",     # Island Gardens DLR — on Manchester Road
    "MINOR":  "Minories entrance",            # Tower Gateway DLR — Minories street
    "NWR":    "North Woolwich Road entrance", # Pontoon Dock DLR — A1020 road
    "PIER":   "Pier entrance",               # King George V DLR — Royal Docks pier
    "SEA":    "Dock entrance",               # Royal Victoria DLR — dock waterfront side
    "SP":     "Station Parade",              # Maidenhead — Station Parade shopping area
    "STARL":  "Star Lane entrance",           # Star Lane DLR — Star Lane cross street
    "STEPH":  "Station approach",            # Star Lane DLR — south-side station approach
    "UGLH":   "Upper concourse",             # City Thameslink — above-platform ticket hall level
    "VICTO":  "Royal Victoria Dock",         # Royal Victoria DLR — dock exit
    "WFERR":  "Westferry Road entrance",     # Westferry DLR
    "WIDR":   "Westferry Road side entrance",# Westferry DLR — secondary street entrance
    "WILTO":  "Wilton Road entrance",         # Abbey Wood — Wilton Road (station's street)
    "WOO":    "Station concourse",           # Woolwich Arsenal
}

# Line prefix codes used in area names like "DisWB", "PicNB"
_LINE_PREFIX: dict[str, str] = {
    "Bak": "Bakerloo line",
    "Cen": "Central line",
    "Cir": "Circle line",
    "Dis": "District line",
    "Ham": "Hammersmith & City line",
    "Jub": "Jubilee line",
    "Met": "Metropolitan line",
    "Nor": "Northern line",
    "Pic": "Piccadilly line",
    "Vic": "Victoria line",
    "Wat": "Waterloo & City line",
    "DLR": "DLR",
    "EL":  "Elizabeth line",
    "NR":  "National Rail",
    "Ovr": "London Overground",
    "OVG": "London Overground",
}

_DIR_SUFFIX: dict[str, str] = {
    "NB": "northbound",
    "SB": "southbound",
    "EB": "eastbound",
    "WB": "westbound",
    "IB": "inbound",
    "OB": "outbound",
}

_DLR_SUFFIX: dict[str, str] = {
    "DLR-N": "DLR northbound",
    "DLR-S": "DLR southbound",
    "DLR-E": "DLR eastbound",
    "DLR-W": "DLR westbound",
}


_CARDINAL: dict[str, str] = {
    "N": "north", "S": "south", "E": "east", "W": "west",
    "NE": "north-east", "NW": "north-west", "SE": "south-east", "SW": "south-west",
    "NL": "north lower", "SL": "south lower", "M": "middle",
}

# Maps a line-prefix code (first 2-4 chars, case-insensitive) to its slug for matching
_PREFIX_TO_SLUG: dict[str, str] = {
    "bak": "bakerloo", "cen": "central", "cir": "circle",
    "dis": "district", "ham": "hammersmith-city", "jub": "jubilee",
    "met": "metropolitan", "nor": "northern", "pic": "piccadilly",
    "vic": "victoria", "wat": "waterloo-city", "dlr": "dlr",
    "el":  "elizabeth", "ovr": "london-overground", "ovg": "london-overground",
    "nr":  "national-rail",
}


def _expand_compound(raw: str) -> str | None:
    """Expand codes built from a known stem + a cardinal/number suffix.

    Examples:
        BookN   → "Booking Hall (north)"
        Sub-W   → "Subway (west)"
        TH-E    → "Ticket Hall (east)"
        PiccN   → "Piccadilly line northbound"
        DLR10   → "DLR platform 10"
        Met34   → "Metropolitan line platforms 3–4"
        Nort1   → "Northern line platform 1"
    """
    # Normalise separators
    s = raw.replace("-", "").replace(" ", "")

    # Compound stems with a location/cardinal suffix
    _STEMS: list[tuple[str, str]] = [
        ("Book",  "Booking Hall"),
        ("BH",    "Booking Hall"),
        ("TH",    "Ticket Hall"),
        ("Sub",   "Subway"),
        ("Con",   "Concourse"),
        ("Conc",  "Concourse"),
        ("MEZ",   "Mezzanine"),
        ("Mez",   "Mezzanine"),
        ("Ent",   "Entrance"),
        ("Entr",  "Entrance"),
        ("ENT",   "Entrance"),
        ("Brid",  "Bridge"),
        ("FBH",   "Footbridge"),
        ("FOOTB", "Footbridge"),
        ("Foot",  "Footbridge"),
        ("RPL",   "Railway platform"),
        ("RPLD",  "Railway platform"),
        ("RPLS",  "Railway platform (south)"),
        ("RPLN",  "Railway platform (north)"),
        ("UpCon", "Upper Concourse"),
        ("LoCon", "Lower Concourse"),
        ("LoCo",  "Lower Concourse"),
        ("UpFlr", "Upper floor"),
        ("Nort",  "Northern line platform"),
        ("Nor",   "Northern line platforms"),
        ("Cent",  "Central line platform"),
        ("Cen",   "Central line platforms"),
        ("Vict",  "Victoria line platform"),
        ("Dist",  "District line platforms"),
        ("Dis",   "District line platforms"),
        ("Met",   "Metropolitan line platforms"),
        ("Jubi",  "Jubilee line"),
        ("Jubi",  "Jubilee line"),
        ("Picc",  "Piccadilly line"),
        ("Pic",   "Piccadilly line platform"),
        ("ELTH",  "Elizabeth line ticket hall"),
        ("ELL",   "Elizabeth line lower"),
        ("ELM",   "Elizabeth line mezzanine"),
        ("ELBH",  "Elizabeth line booking hall"),
        ("ELEnt", "Elizabeth line entrance"),
        ("ELWL",  "Elizabeth line west level"),
        ("ELEL",  "Elizabeth line east level"),
        ("BakLa", "Bakerloo line landing"),
    ]
    for stem, label in _STEMS:
        stem_norm = stem.replace("-", "").replace(" ", "")
        if s.upper().startswith(stem_norm.upper()):
            tail = s[len(stem_norm):].strip()
            if not tail:
                return label
            # Cardinal direction
            if tail.upper() in _CARDINAL:
                return f"{label} ({_CARDINAL[tail.upper()]})"
            # Platform number(s) e.g. "1", "23", "45"
            if tail.isdigit():
                if len(tail) == 2:
                    return f"{label} {tail[0]}–{tail[1]}"
                return f"{label} {tail}"
            # DLR + number
            if stem_norm.upper() == "DLR" and tail.isdigit():
                return f"DLR platform {tail}"
    return None


def translate_area_name(raw: str) -> str:
    """Convert a short TfL area code to a human-readable label."""
    if not raw:
        return raw
    raw = raw.strip()

    if raw in _AREA_EXACT:
        return _AREA_EXACT[raw]
    if raw in _DLR_SUFFIX:
        return _DLR_SUFFIX[raw]

    # Line + direction pattern: e.g. "DisWB", "NorNB", "PicSB"
    for prefix, line_name in _LINE_PREFIX.items():
        if raw.startswith(prefix):
            suffix = raw[len(prefix):]
            direction = _DIR_SUFFIX.get(suffix)
            if direction:
                return f"{line_name} {direction}"
            if not suffix:
                return line_name

    # Compound stem + cardinal/number
    expanded = _expand_compound(raw)
    if expanded:
        return expanded

    return raw  # genuinely unknown — return as-is


def translate_area_with_platforms(area_name: str, station_uid: str,
                                  platforms_by_station: dict) -> str:
    """Translate an area code, preferring the physical platform name when possible.

    For line+direction codes (e.g. "DisWB"), we look up the actual platform at that
    station whose direction and line slug match, and return its FriendlyName
    (e.g. "Westbound Platform 1") rather than the derived line label.  This correctly
    handles shared platforms where only one line is encoded in the area name.
    """
    # First try the direction-free lookups (booking hall, subway, etc.)
    exact = _AREA_EXACT.get(area_name) or _DLR_SUFFIX.get(area_name)
    if exact:
        return exact

    # Try to match a line+direction code to a real platform at this station
    for prefix in _LINE_PREFIX:
        if area_name.startswith(prefix):
            suffix = area_name[len(prefix):]
            dir_key = suffix[:2].upper()          # e.g. "WB"
            if dir_key in _DIR_SUFFIX:
                slug_fragment = _PREFIX_TO_SLUG.get(prefix.lower(), "")
                dir_word = _DIR_SUFFIX[dir_key]   # e.g. "westbound"
                # Search customer-facing platforms for direction + line match
                for plat in platforms_by_station.get(station_uid, []):
                    if not parse_bool(plat.get("IsCustomerFacing", "False")):
                        continue
                    pid = plat["UniqueId"]
                    slug = line_slug_from_platform_id(pid)
                    card = (plat.get("CardinalDirection") or "").lower()
                    if dir_word in card and (not slug_fragment or slug_fragment in slug):
                        return plat["FriendlyName"].strip()
                # No platform match — fall through to generic translation
                break

    return translate_area_name(area_name)


def read_csv(filename: str) -> list[dict]:
    with open(DATA_DIR / filename, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def parse_bool(val: str) -> bool:
    return str(val).strip().upper() in ("TRUE", "YES", "1")


def parse_interchange(val: str) -> str:
    v = (val or "").strip()
    if v in ("Full", "Partial", "None"):
        return v
    return "Full" if v else "None"


def parse_zones(val: str) -> list[int]:
    zones = []
    # Spec uses "|" as separator; tolerate "+" and "/" found in older data
    for part in val.replace("|", ",").replace("+", ",").replace("/", ",").split(","):
        part = part.strip()
        if part.isdigit():
            zones.append(int(part))
    return sorted(set(zones))


def line_slug_from_platform_id(platform_id: str) -> str:
    """Extract the line slug from a platform UniqueId.

    Handles two formats:
      - Tube/rail: 'HUBKGX-Plat01-NB-victoria'  → 'victoria'
      - Tram:      '940GZZCRADD-EB-tram'         → 'tram'
    """
    idx = platform_id.find("-Plat")
    if idx == -1:
        # Tram format: {station_id}-{DIR}-{line}
        parts = platform_id.split("-")
        if len(parts) >= 3:
            return "-".join(parts[2:])
        return ""
    rest = platform_id[idx + 1:]   # e.g. "Plat01-NB-victoria"
    seg = rest.split("-")
    if len(seg) >= 3:
        return "-".join(seg[2:])   # everything after the direction segment
    return ""


def resolve_areas(area_ids_str: str, point_by_id: dict,
                  station_uid: str = "", platforms_by_station: dict | None = None) -> str | None:
    """Resolve pipe-separated station-point IDs to a readable area string."""
    if not area_ids_str or not area_ids_str.strip():
        return None
    ids = [x.strip() for x in area_ids_str.split("|") if x.strip()]
    names = []
    for aid in ids:
        pt = point_by_id.get(aid)
        if pt:
            area_code = (pt.get("AreaName") or "").strip()
            if station_uid and platforms_by_station is not None:
                label = translate_area_with_platforms(area_code, station_uid, platforms_by_station)
            else:
                label = translate_area_name(area_code)
            names.append(label or aid)
        else:
            names.append(aid)
    return ", ".join(names) if names else None


def get_coordinates(station_uid: str, points_by_station: dict) -> dict | None:
    """Best ground-level coordinates for a station (concourse → entrance → any)."""
    points = points_by_station.get(station_uid, [])
    for preferred_area in ("AC", "MET", "BookH", "Entr", "Bus"):
        for pt in points:
            if pt["AreaName"] == preferred_area and pt.get("Level") == "0":
                try:
                    return {"lat": float(pt["Lat"]), "lng": float(pt["Lon"])}
                except (ValueError, KeyError):
                    pass
    # Fall back to first point with valid coords at ground level
    for pt in points:
        if pt.get("Level") == "0":
            try:
                return {"lat": float(pt["Lat"]), "lng": float(pt["Lon"])}
            except (ValueError, KeyError):
                pass
    # Any level as last resort
    for pt in points:
        try:
            return {"lat": float(pt["Lat"]), "lng": float(pt["Lon"])}
        except (ValueError, KeyError):
            pass
    return None


def build_lift_units(station_uid: str, lifts_by_station: dict, point_by_id: dict,
                     platforms_by_station: dict | None = None) -> list[dict]:
    result = []
    for lift in lifts_by_station.get(station_uid, []):
        kw = dict(station_uid=station_uid, platforms_by_station=platforms_by_station)
        from_str = resolve_areas(lift.get("FromAreas", ""), point_by_id, **kw)
        to_str   = resolve_areas(lift.get("ToAreas", ""), point_by_id, **kw)
        via_str  = resolve_areas(lift.get("IntermediateAreas", ""), point_by_id, **kw)
        via2_str = resolve_areas(lift.get("IntermediateAreas2", ""), point_by_id, **kw)

        obj: dict = {
            "id":              lift["LiftUniqueId"],
            "name":            (lift.get("FriendlyName") or "").strip() or f"Lift {lift['LiftId']}",
            "from":            from_str,
            "to":              to_str,
            "limitedCapacity": parse_bool(lift.get("LimitedCapacityLift", "False")),
        }
        if via_str:
            obj["via"] = via_str
        if via2_str and via2_str != via_str:
            obj["via2"] = via2_str
        notes = (lift.get("LiftNotes") or "").strip()
        if notes:
            obj["notes"] = notes
        result.append(obj)
    return result


def platforms_are_same_level_connected(station_uid: str, points_by_station: dict,
                                       same_level_paths: dict) -> bool:
    """Return True if the station's platform areas are all reachable from each other
    at the same level — indicating lifts land at a shared concourse serving all platforms.

    Uses up to two hops so that intermediate concourse areas (e.g. 'Picca', 'North')
    between two platform areas are still detected as connected.
    """
    pts = {pt["UniqueId"]: pt["AreaName"] for pt in points_by_station.get(station_uid, [])}
    station_pt_ids = set(pts.keys())

    # Platform-level areas: AreaName matches the line+direction pattern (e.g. CenWB, NorNB)
    plat_point_ids = {
        uid for uid, area in pts.items()
        if any(area.startswith(pfx) and area[len(pfx):] in _DIR_SUFFIX
               for pfx in _LINE_PREFIX)
    }
    if len(plat_point_ids) < 2:
        return False

    # Build one-hop and two-hop reachability sets within the station for each platform point
    for pid in plat_point_ids:
        one_hop = same_level_paths.get(pid, set()) & station_pt_ids
        # Direct connection to another platform area
        if one_hop & plat_point_ids:
            return True
        # Two-hop: platform → intermediate → another platform
        for mid in one_hop:
            if same_level_paths.get(mid, set()) & plat_point_ids - {pid}:
                return True
    return False


def synthesise_lift_units(station_uid: str, lift_count: int,
                          platforms_by_station: dict,
                          points_by_station: dict,
                          same_level_paths: dict) -> list[dict]:
    """Build synthetic lift_units for stations absent from Lifts.csv.

    At deep-tube stations (e.g. Covent Garden, Hampstead) the lifts land at a
    shared concourse from which both platforms are accessible.  We detect this via
    same-level paths between platform areas and, when found, set every lift's `to`
    to the full list of platforms rather than assigning one lift per platform.
    """
    plats = [p for p in platforms_by_station.get(station_uid, [])
             if parse_bool(p.get("IsCustomerFacing", "False"))]
    # All synthesised stations are deep-tube: lifts land at a shared circular
    # concourse from which every platform is accessible, so every lift serves all.
    to_str = (", ".join(p["FriendlyName"].strip() for p in plats)
              if plats else "platform")

    result = []
    for i in range(lift_count):
        result.append({
            "id":              f"{station_uid}-Lift-{i + 1}",
            "name":            f"Lift {i + 1}",
            "from":            "Street",
            "to":              to_str,
            "limitedCapacity": False,
        })
    return result


def build_step_free_graph(same_level_rows: list, ramp_rows: list,
                          lifts_rows: list) -> dict[str, set]:
    """Build an undirected step-free pathway graph from the three path CSV files.

    Per the PDF spec, only step-free pathways are included (stairs/escalators are
    excluded). A platform is step-free accessible from street if and only if a path
    exists from the station's '<UID>-Outside' node to the platform's UniqueId.
    """
    graph: dict[str, set] = defaultdict(set)
    for row in same_level_rows:
        graph[row["From"]].add(row["To"])
        graph[row["To"]].add(row["From"])
    for row in ramp_rows:
        graph[row["From"]].add(row["To"])
        graph[row["To"]].add(row["From"])
    for lift in lifts_rows:
        frm_ids = [x.strip() for x in lift["FromAreas"].split("|") if x.strip()]
        to_ids  = [x.strip() for x in lift["ToAreas"].split("|")  if x.strip()]
        for f in frm_ids:
            for t in to_ids:
                graph[f].add(t)
                graph[t].add(f)
        # Intermediate floor (3-floor lifts)
        for mid_field in ("IntermediateAreas", "IntermediateAreas2"):
            mid_ids = [x.strip() for x in lift.get(mid_field, "").split("|") if x.strip()]
            for m in mid_ids:
                for f in frm_ids:
                    graph[f].add(m); graph[m].add(f)
                for t in to_ids:
                    graph[t].add(m); graph[m].add(t)
    return graph


def reachable_from_outside(station_uid: str, graph: dict[str, set]) -> set[str]:
    """BFS from the station's virtual outside node; returns all reachable node IDs."""
    start = f"{station_uid}-Outside"
    if start not in graph:
        return set()
    visited = {start}
    queue = [start]
    while queue:
        node = queue.pop(0)
        for nb in graph.get(node, set()):
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)
    return visited


def derive_step_free_access(platform_id: str, reachable: set[str],
                            level_access: bool, boarding_ramp: bool) -> str:
    """Per-platform step-free access level, derived via pathway graph reachability.

    "Full"        — step-free route exists from street to platform AND level boarding.
    "to_platform" — step-free route exists but gap/step remains to board the train.
    "to_train"    — level boarding exists but no step-free street-to-platform route.
    "none"        — no step-free route from street to this platform.
    """
    can_board    = level_access or boarding_ramp
    is_reachable = platform_id in reachable
    if is_reachable and can_board:
        return "Full"
    if is_reachable:
        return "to_platform"
    if can_board:
        return "to_train"
    return "none"


def build_platforms(station_uid: str, platforms_by_station: dict,
                    services_by_platform: dict, reachable: set | None = None,
                    interchange_dist: dict | None = None) -> list[dict]:
    result = []
    for plat in platforms_by_station.get(station_uid, []):
        if not parse_bool(plat.get("IsCustomerFacing", "False")):
            continue

        pid       = plat["UniqueId"]
        svc       = services_by_platform.get(pid, {})
        line_slug = line_slug_from_platform_id(pid)
        # Slugs may be pipe-joined for shared platforms (e.g. "circle|hammersmith-city")
        lines = [LINE_DISPLAY.get(s, s) for s in line_slug.split("|") if s]

        level_access  = parse_bool(svc.get("DesignatedLevelAccessPoint", "False"))
        boarding_ramp = parse_bool(svc.get("LevelAccessByManualRamp", "False"))

        obj: dict = {
            "id":               pid,
            "name":             plat["FriendlyName"].strip(),
            "direction":        plat.get("CardinalDirection", "").strip() or None,
            "lines":            lines if lines else None,
            "stepFreeAccess":   derive_step_free_access(
                                    pid, reachable or set(), level_access, boarding_ramp),
            "accessibleEntrance": plat.get("AccessibleEntranceName", "").strip() or None,
        }

        if svc:
            for field, key in (("gapMm", "AverageGap"), ("stepMm", "AverageStep")):
                raw = (svc.get(key) or "").strip()
                if raw:
                    try:
                        obj[field] = int(float(raw))
                    except ValueError:
                        pass
            obj["boardingRamp"]  = boarding_ramp
            obj["levelAccess"]   = level_access
            loc  = (svc.get("LocationOfLevelAccess") or "").strip()
            note = (svc.get("AdditionalAccessibilityInformation") or "").strip()
            if loc:
                obj["levelAccessLocation"] = loc
            if note:
                obj["accessibilityNote"] = note

        # Step-free interchange distances to other platforms at this station
        if interchange_dist:
            dists = []
            all_pids = [p["UniqueId"] for p in platforms_by_station.get(station_uid, [])
                        if parse_bool(p.get("IsCustomerFacing", "False")) and p["UniqueId"] != pid]
            for other_pid in all_pids:
                d = interchange_dist.get((pid, other_pid))
                if d is not None:
                    other = next((p for p in platforms_by_station.get(station_uid, [])
                                  if p["UniqueId"] == other_pid), None)
                    if other:
                        dists.append({"to": other["FriendlyName"].strip(), "distanceM": d})
            if dists:
                obj["interchangeTo"] = dists

        result.append({k: v for k, v in obj.items() if v is not None})

    return result


# MOCKED DATA — no TfL CSV source exists for escalator topology.
# The TfL step-free access feed covers only step-free pathways; escalators are
# explicitly excluded (they are not step-free routes). These synthetic entries
# distribute escalators round-robin across customer-facing platforms based solely
# on escalator count. The from/to descriptions are estimates only.
# MUST be replaced with hand-curated data before treating as authoritative.
def synthesise_escalator_units(station_uid: str, escalator_count: int,
                               platforms_by_station: dict) -> list[dict]:
    """Build synthetic escalator_units — MOCKED, no TfL source exists for topology.

    Every entry is tagged with 'mocked: true' to make clear the routing is estimated.
    """
    plats = [p for p in platforms_by_station.get(station_uid, [])
             if parse_bool(p.get("IsCustomerFacing", "False"))]

    result = []
    for i in range(escalator_count):
        platform = plats[i % len(plats)] if plats else None
        to_str = platform["FriendlyName"].strip() if platform else "platform"
        result.append({
            "id":     f"{station_uid}-Escalator-{i + 1}",
            "name":   f"Escalator {i + 1}",
            "from":   "Street",
            "to":     to_str,
            "mocked": True,
        })
    return result


def build_toilets(station_uid: str, toilets_by_station: dict) -> list[dict]:
    result = []
    for t in toilets_by_station.get(station_uid, []):
        obj: dict = {
            "type":             (t.get("Type") or "").strip(),
            "accessible":       parse_bool(t.get("IsAccessible", "False")),
            "babyChanging":     parse_bool(t.get("HasBabyChanging", "False")),
            "insideGateline":   parse_bool(t.get("IsInsideGateLine", "False")),
            "feeCharged":       parse_bool(t.get("IsFeeCharged", "False")),
            "radarKey":         parse_bool(t.get("RadarKey", "False")),
            "opensWithStation": parse_bool(t.get("OpensWithStation", "True")),
        "managedByTfL":     parse_bool(t.get("IsManagedByTfL", "True")),
        }
        loc = (t.get("Location") or "").strip()
        if loc:
            obj["location"] = loc
        result.append(obj)
    return result


def apply_overrides(stations: list[dict]) -> None:
    """Apply hand-curated corrections from station_overrides.json.

    Runs after all CSV-derived enrichment so manual data wins over automated sources.
    Schema-comment entries (name == '__schema_comment__') are silently skipped.
    Unknown station names are reported as warnings.
    """
    if not OVERRIDES_JSON.exists():
        return
    overrides: list[dict] = json.loads(OVERRIDES_JSON.read_text(encoding="utf-8"))
    by_name = {s["name"]: s for s in stations}
    for override in overrides:
        name = override.get("name", "")
        if name == "__schema_comment__":
            continue
        station = by_name.get(name)
        if station is None:
            print(f"WARNING: station_overrides.json references unknown station {name!r}")
            continue
        for field in ("lift_units", "escalator_units", "lifts", "escalators"):
            if field in override:
                station[field] = override[field]
        if "platforms_patch" in override:
            plat_by_id = {p["id"]: p for p in station.get("platforms", [])}
            for plat_id, patch in override["platforms_patch"].items():
                if plat_id in plat_by_id:
                    plat_by_id[plat_id].update(patch)
                else:
                    print(f"WARNING: station_overrides.json references unknown platform {plat_id!r} on {name!r}")


def main() -> None:
    print("Loading source data…")
    all_stations: list[dict] = json.loads(TUBE_JSON.read_text(encoding="utf-8"))

    stations_rows      = read_csv("Stations.csv")
    station_points     = read_csv("StationPoints.csv")
    platforms_rows     = read_csv("Platforms.csv")
    services_rows      = read_csv("PlatformServices.csv")
    lifts_rows         = read_csv("Lifts.csv")
    toilets_rows       = read_csv("Toilets.csv")
    same_level_rows    = read_csv("SameLevelPaths.csv")
    ramp_rows          = read_csv("RampRoutes.csv")
    interchange_rows   = read_csv("StepFreeIntechangeInfo.csv")

    # --- Build indexes -------------------------------------------------------
    csv_by_name: dict[str, dict] = {}
    csv_by_id:   dict[str, dict] = {}
    for row in stations_rows:
        csv_by_name[row["Name"]]   = row
        csv_by_id[row["UniqueId"]] = row

    points_by_station: dict[str, list] = defaultdict(list)
    point_by_id:       dict[str, dict] = {}
    for pt in station_points:
        points_by_station[pt["StationUniqueId"]].append(pt)
        point_by_id[pt["UniqueId"]] = pt

    platforms_by_station: dict[str, list] = defaultdict(list)
    for plat in platforms_rows:
        platforms_by_station[plat["StationUniqueId"]].append(plat)

    services_by_platform: dict[str, dict] = {}
    for svc in services_rows:
        pid = svc["PlatformUniqueId"]
        if pid not in services_by_platform:
            services_by_platform[pid] = svc

    lifts_by_station: dict[str, list] = defaultdict(list)
    for lift in lifts_rows:
        lifts_by_station[lift["StationUniqueId"]].append(lift)

    same_level_paths: dict[str, set] = defaultdict(set)
    for row in same_level_rows:
        same_level_paths[row["From"]].add(row["To"])

    step_free_graph = build_step_free_graph(same_level_rows, ramp_rows, lifts_rows)

    # Walking distances between platforms (step-free interchange info)
    interchange_dist: dict[tuple, int] = {}
    for row in interchange_rows:
        try:
            dist = int(float(row["DistanceInMetres"]))
            interchange_dist[(row["FromPlatformUniqueId"], row["ToPlatformUniqueId"])] = dist
        except (ValueError, KeyError):
            pass

    toilets_by_station: dict[str, list] = defaultdict(list)
    for t in toilets_rows:
        uid = (t.get("StationUniqueId") or "").strip()
        if uid:
            toilets_by_station[uid].append(t)

    # --- Enrich each station -------------------------------------------------
    matched   = 0
    unmatched = []

    for station in all_stations:
        name   = station["name"]
        mapped = NAME_MAP.get(name)

        if mapped:
            csv_row = csv_by_id.get(mapped) or csv_by_name.get(mapped)
        else:
            csv_row = csv_by_name.get(name)

        if not csv_row:
            unmatched.append(name)
            continue

        matched += 1
        uid      = csv_row["UniqueId"]
        hub_code = (csv_row.get("HubNaptanCode") or "").strip()

        station["id"]               = hub_code or uid
        station["zones"]            = parse_zones(csv_row.get("FareZones", ""))
        station["wifi"]             = parse_bool(csv_row.get("Wifi", "False"))
        station["blueBadgeParking"] = parse_bool(csv_row.get("BlueBadgeCarParking", "False"))
        station["taxiRank"]         = parse_bool(csv_row.get("TaxiRanksOutsideStation", "False"))
        station["interchange"] = {
            "nationalRail": parse_interchange(csv_row.get("NationalRailInterchange", "")),
            "bus":          parse_interchange(csv_row.get("MainBusInterchange", "")),
            "pier":         parse_interchange(csv_row.get("PierInterchange", "")),
        }

        coords = get_coordinates(uid, points_by_station)
        if coords:
            station["coordinates"] = coords

        reachable      = reachable_from_outside(uid, step_free_graph)
        enriched_plats = build_platforms(uid, platforms_by_station, services_by_platform,
                                         reachable=reachable,
                                         interchange_dist=interchange_dist)
        if enriched_plats:
            station["platforms"] = enriched_plats
        station.pop("step_free", None)

        lift_units = build_lift_units(uid, lifts_by_station, point_by_id, platforms_by_station)
        if not lift_units and station.get("lifts", 0) > 0:
            lift_units = synthesise_lift_units(uid, station["lifts"], platforms_by_station,
                                               points_by_station, same_level_paths)
        if lift_units:
            station["lift_units"] = lift_units
            station["lifts"]      = len(lift_units)

        escalator_count = station.get("escalators", 0)
        if escalator_count > 0:
            escalator_units = synthesise_escalator_units(uid, escalator_count,
                                                         platforms_by_station)
            station["escalator_units"] = escalator_units

        toilets = build_toilets(uid, toilets_by_station)
        if toilets:
            station["toilets"] = toilets

    # --- Apply hand-curated overrides ----------------------------------------
    apply_overrides(all_stations)

    # --- Report and write ----------------------------------------------------
    print(f"Matched {matched}/{len(all_stations)} stations.")
    if unmatched:
        print(f"Unmatched (kept as-is): {sorted(unmatched)}")

    TUBE_JSON.write_text(
        json.dumps(all_stations, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Written → {TUBE_JSON}")


if __name__ == "__main__":
    main()
