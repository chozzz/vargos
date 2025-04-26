import { Test, TestingModule } from "@nestjs/testing";
import { FunctionsController } from "./functions.controller";

describe("FunctionsController", () => {
  let controller: FunctionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FunctionsController],
    }).compile();

    controller = module.get<FunctionsController>(FunctionsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
