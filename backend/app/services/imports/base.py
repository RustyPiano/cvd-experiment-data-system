from abc import ABC, abstractmethod

from openpyxl.workbook.workbook import Workbook

from app.schemas.imports import ImportProfileInfo, ParsedExperimentDraft


class ImportProfile(ABC):
    """A pluggable parser that maps a specific spreadsheet layout to experiment drafts.

    Adding support for a new machine/export format means implementing one of
    these and registering it in :mod:`app.services.imports.registry` — no changes
    to the import service or endpoints are required.
    """

    key: str
    display_name: str
    description: str = ""

    def info(self) -> ImportProfileInfo:
        return ImportProfileInfo(
            key=self.key,
            display_name=self.display_name,
            description=self.description or None,
        )

    @abstractmethod
    def parse(self, workbook: Workbook) -> tuple[list[ParsedExperimentDraft], list[str]]:
        """Parse a workbook into drafts plus any workbook-level warnings."""
        raise NotImplementedError
