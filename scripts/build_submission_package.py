import json
import shutil
import zipfile
from pathlib import Path

from common import ROOT_DIR, current_timestamp


OUTPUT_DIR = ROOT_DIR / "outputs" / "submission_package"
PACKAGE_ROOT = OUTPUT_DIR / "待填作品编号-参赛总文件夹"
ARTIFACTS_DIR = PACKAGE_ROOT / "待填作品编号-01作品与答辩材料"
SOURCE_DIR = PACKAGE_ROOT / "待填作品编号-02素材与源码"
DOC_DIR = PACKAGE_ROOT / "待填作品编号-03设计与开发文档"
VIDEO_DIR = PACKAGE_ROOT / "待填作品编号-04作品演示视频"


ROOT_FILES = [
    "README.md",
    "requirements.txt",
    "启动项目.ps1",
    "更新数据.ps1",
    "生成材料.ps1",
]
ROOT_DIRS = [
    "backend",
    "frontend",
    "scripts",
    "config",
]
DATA_SAMPLES = [
    "data/processed/weather_summary.json",
    "data/processed/poi_summary.json",
    "data/processed/official_cooling_sites.json",
    "data/processed/accessibility_summary.json",
    "data/processed/risk_summary.json",
    "data/processed/site_recommendations.json",
    "data/processed/optimization_experiments.json",
    "data/processed/competition_experiments.json",
    "data/raw/walk_network_status.json",
    "data/external/source_refresh_manifest.json",
]
DOC_FILES = [
    "docs/研究报告-热龄卫士.md",
    "docs/研究报告初稿-热龄卫士.md",
    "docs/项目说明书.md",
    "docs/部署说明.md",
    "docs/网站进入与使用说明.md",
    "docs/演示脚本.md",
]
REPORT_ASSET_DIRS = [
    "outputs/report_tables",
    "outputs/report_charts",
]
TEMPLATE_FILES = [
    "要求文档/04-2 作品信息概要表（大数据应用，2026版）模板.docx",
    "要求文档/04-3-AI工具使用说明（选用模板）（大数据应用，2026年版）.docx",
    "要求文档/04-4 作品报告（大数据应用赛，2026版）模板.docx",
]
MANUAL_REQUIRED = [
    "研究报告.pdf",
    "作品信息概要表.pdf",
    "演示PPT.pdf",
    "演示视频.mp4（建议 5 分钟左右，1080P，<=500MB）",
    "报名表（全体作者/指导教师签字并加盖学校或教务处公章）",
    "版权声明（全体作者/指导教师签字）",
    "AI工具使用说明.pdf 及附录佐证材料",
]


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def safe_copy(src: Path, dst: Path) -> bool:
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def safe_copytree(src: Path, dst: Path) -> bool:
    if not src.exists():
        return False
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    return True


def write_folder_readme(path: Path, title: str, description: str, bullet_points: list[str]) -> None:
    body = [
        title,
        "",
        description,
        "",
        "当前目录说明：",
        *[f"- {item}" for item in bullet_points],
        "",
        "注意：",
        "- 本目录需与竞赛系统上传分类保持一致。",
        "- 最终提交前请检查文件名、PDF版本、百度网盘链接与签字盖章件是否一致。",
    ]
    write_text(path / "readme.txt", "\n".join(body))


def build_source_zip() -> Path:
    zip_path = SOURCE_DIR / "热龄卫士-源码与样例.zip"
    included: list[str] = []
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in ROOT_FILES:
            src = ROOT_DIR / relative
            if src.exists():
                archive.write(src, arcname=relative)
                included.append(relative)

        for relative in ROOT_DIRS:
            src_dir = ROOT_DIR / relative
            if not src_dir.exists():
                continue
            for file in src_dir.rglob("*"):
                if file.is_file():
                    archive.write(file, arcname=str(file.relative_to(ROOT_DIR)))
                    included.append(str(file.relative_to(ROOT_DIR)))

        for relative in DATA_SAMPLES:
            src = ROOT_DIR / relative
            if src.exists():
                archive.write(src, arcname=relative)
                included.append(relative)

    write_text(
        SOURCE_DIR / "源码压缩包说明.txt",
        "\n".join(
            [
                "本压缩包包含：",
                "- 后端、前端、脚本与配置文件",
                "- 关键结果样例与数据源刷新清单",
                "- 启动、更新与材料导出脚本",
                "",
                "不包含：",
                "- .venv、.git、完整外部原始大数据文件",
                "- 编译/缓存中间产物",
                "",
                f"构建时间：{current_timestamp()}",
                f"打包文件数：{len(included)}",
            ]
        ),
    )
    return zip_path


def copy_docs_and_assets() -> dict:
    copied = {"docs": [], "assets": [], "templates": [], "missing": []}

    report_bucket = DOC_DIR / "报告与说明"
    assets_bucket = DOC_DIR / "图表与表格"
    template_bucket = DOC_DIR / "官方模板"

    for relative in DOC_FILES:
        src = ROOT_DIR / relative
        dst = report_bucket / src.name
        if safe_copy(src, dst):
            copied["docs"].append(relative)
        else:
            copied["missing"].append(relative)

    for relative in REPORT_ASSET_DIRS:
        src = ROOT_DIR / relative
        dst = assets_bucket / src.name
        if safe_copytree(src, dst):
            copied["assets"].append(relative)
        else:
            copied["missing"].append(relative)

    for relative in TEMPLATE_FILES:
        src = ROOT_DIR / relative
        dst = template_bucket / src.name
        if safe_copy(src, dst):
            copied["templates"].append(relative)
        else:
            copied["missing"].append(relative)

    ai_stub = "\n".join(
        [
            "# AI工具使用记录待填写清单",
            "",
            "请基于官方模板逐项填写：",
            "- AI工具名称、版本、访问方式、使用时间",
            "- 使用环节与目的",
            "- 关键提示词",
            "- AI回复的关键内容",
            "- 人工修改说明与采纳比例",
            "",
            "建议同时准备：",
            "- 关键截图（含时间戳）",
            "- 关键交互录屏（<=5分钟）",
            "- 代码中AI辅助部分注释说明",
        ]
    )
    write_text(report_bucket / "AI工具使用记录-待填写.md", ai_stub)
    return copied


def create_artifact_placeholders() -> None:
    write_text(
        ARTIFACTS_DIR / "运行入口与部署说明.txt",
        "\n".join(
            [
                "项目运行入口：",
                "- 一键启动：.\\启动项目.ps1",
                "- 手动启动：uvicorn backend.app.main:app --host 127.0.0.1 --port 8000",
                "- 本地访问：http://127.0.0.1:8000/",
                "",
                "建议随答辩材料一起放入：",
                "- 部署说明.md",
                "- 网站进入与使用说明.md",
                "- 演示PPT.pdf",
                "- 如有单独答辩演示视频，也放在本目录并注明“答辩时演示”",
            ]
        ),
    )
    safe_copy(ROOT_DIR / "docs/部署说明.md", ARTIFACTS_DIR / "部署说明.md")
    safe_copy(ROOT_DIR / "docs/网站进入与使用说明.md", ARTIFACTS_DIR / "网站进入与使用说明.md")
    safe_copy(ROOT_DIR / "docs/项目说明书.md", ARTIFACTS_DIR / "项目说明书.md")
    write_text(
        VIDEO_DIR / "待放置-演示视频.txt",
        "请将最终成片导出为 MP4 并放入本目录。建议 5 分钟左右、1080P、文件大小不超过 500MB。",
    )


def write_root_manifest(copy_summary: dict, source_zip_path: Path) -> None:
    manifest = {
        "generated_at": current_timestamp(),
        "package_root": str(PACKAGE_ROOT.relative_to(ROOT_DIR)),
        "included": {
            "artifact_dir": str(ARTIFACTS_DIR.relative_to(ROOT_DIR)),
            "source_zip": str(source_zip_path.relative_to(ROOT_DIR)),
            "docs": copy_summary["docs"],
            "report_assets": copy_summary["assets"],
            "templates": copy_summary["templates"],
        },
        "manual_required": MANUAL_REQUIRED,
        "missing_local_files": copy_summary["missing"],
    }
    write_text(PACKAGE_ROOT / "submission_manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    checklist_lines = [
        "# 提交前待人工补充清单",
        "",
        "以下文件或动作无法自动生成，请在提交前逐项核对：",
        *[f"- [ ] {item}" for item in MANUAL_REQUIRED],
    ]
    if copy_summary["missing"]:
        checklist_lines.extend(
            [
                "",
                "本地尚未找到的文件：",
                *[f"- [ ] {item}" for item in copy_summary["missing"]],
            ]
        )
    write_text(PACKAGE_ROOT / "待人工补充清单.md", "\n".join(checklist_lines))


def main() -> None:
    reset_dir(PACKAGE_ROOT)
    for folder in (ARTIFACTS_DIR, SOURCE_DIR, DOC_DIR, VIDEO_DIR):
        folder.mkdir(parents=True, exist_ok=True)

    write_folder_readme(
        ARTIFACTS_DIR,
        "01作品与答辩材料",
        "放置可执行程序、部署入口、网址、二维码、答辩PPT以及用于作品演示的辅助材料。",
        [
            "部署说明与操作入口",
            "项目说明书、网站进入说明",
            "答辩PPT、演示时使用的辅助文件",
        ],
    )
    write_folder_readme(
        SOURCE_DIR,
        "02素材与源码",
        "放置团队开发产生的全部核心源码、工程文件与少量典型数据样例。",
        [
            "热龄卫士-源码与样例.zip",
            "源码压缩包说明.txt",
        ],
    )
    write_folder_readme(
        DOC_DIR,
        "03设计与开发文档",
        "放置作品报告、作品信息概要表、AI工具使用说明、图表与表格等设计开发文档。",
        [
            "报告与说明/",
            "图表与表格/",
            "官方模板/",
            "AI工具使用记录-待填写.md",
        ],
    )
    write_folder_readme(
        VIDEO_DIR,
        "04作品演示视频",
        "放置最终 MP4 演示视频。如有单独答辩演示版视频，也可一并放入并明确标注。",
        [
            "待放置-演示视频.txt",
        ],
    )

    create_artifact_placeholders()
    source_zip_path = build_source_zip()
    copy_summary = copy_docs_and_assets()
    write_root_manifest(copy_summary, source_zip_path)

    print(f"参赛提交目录已生成：{PACKAGE_ROOT}")


if __name__ == "__main__":
    main()
