import asyncio
import logging

from app.pipeline import Pipeline
from app.settings import Settings
from app.store import ControlledError, Store


def process_job(
    job: dict, settings: Settings, store: Store, pipeline: Pipeline | None = None
):
    report = None
    try:
        captured = settings.model_copy(update={"model": job["model"]})
        report = (pipeline or Pipeline(captured, store)).run(job)
        report["analysis_id"] = job["id"]
        report["model"] = job["model"]
        store.phase(job["id"], "publishing")
        store.finish(job["id"], report)
    except ControlledError as error:
        store.finish(job["id"], report, {"code": error.code, "message": error.message})
    except Exception:
        logging.error("Analysis failed id=%s kind=%s", job["id"], job["kind"])
        store.finish(
            job["id"],
            None,
            {"code": "INTERNAL_ERROR", "message": "Unexpected processing error"},
        )


async def serve():
    settings = Settings.load()
    store = Store(settings.database)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.info("Local worker ready; no provider calls until an analysis is accepted")
    while True:
        store.prune(settings.retention_days)
        job = store.claim()
        if job:
            logging.info("Processing id=%s kind=%s", job["id"], job["kind"])
            await asyncio.to_thread(process_job, job, settings, store)
            logging.info(
                "Finished id=%s status=%s", job["id"], store.get(job["id"])["status"]
            )
        else:
            await asyncio.sleep(1)


if __name__ == "__main__":
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
