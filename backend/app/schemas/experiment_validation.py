from pydantic import BaseModel, Field, model_validator


class ExperimentValidationIssue(BaseModel):
    module_key: str
    field_path: str
    message: str


class ExperimentValidationResponse(BaseModel):
    ok: bool
    errors: list[ExperimentValidationIssue] = Field(default_factory=list)
    warnings: list[ExperimentValidationIssue] = Field(default_factory=list)
    completion_score: int | None = Field(default=None, ge=0, le=100)
    blocking_count: int | None = Field(default=None, ge=0)
    warning_count: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def default_summary_fields(self) -> "ExperimentValidationResponse":
        if self.blocking_count is None:
            self.blocking_count = len(self.errors)
        if self.warning_count is None:
            self.warning_count = len(self.warnings)
        if self.completion_score is None:
            penalty = self.blocking_count * 5 + self.warning_count * 2
            self.completion_score = max(0, 100 - penalty)
        return self
