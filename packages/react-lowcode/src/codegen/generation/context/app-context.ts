import CodegenOptions from "./context";
import { InjectionContext, DefaultInjectionContext } from "./injection-context";

export class AppContext{
    _injectionContext: InjectionContext
    _options: CodegenOptions

    constructor(options:CodegenOptions){
        this._injectionContext = new DefaultInjectionContext()
        this._options = options
    }
    
    public get InjectionContext() : InjectionContext {
        return this._injectionContext;
    }
}