from app.services.imports.base import ImportProfile
from app.services.imports.cvd_process_package import CvdProcessPackageProfile

_PROFILES: dict[str, ImportProfile] = {
    profile.key: profile for profile in (CvdProcessPackageProfile(),)
}


def list_import_profiles() -> list[ImportProfile]:
    return list(_PROFILES.values())


def get_import_profile(key: str) -> ImportProfile | None:
    return _PROFILES.get(key)
