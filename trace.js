let prevContext = {};  // 用来存储上次指令执行时的寄存器值
let registerValues = {};  // 用来存储寄存器值

// 1. 获取寄存器列表
function getRegisterList() {
    return [
        // 通用寄存器
        "x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9",
        "x10", "x11", "x12", "x13", "x14", "x15", "x16", "x17", "x18", "x19",
        "x20", "x21", "x22", "x23", "x24", "x25", "x26", "x27", "x28", "x29", "x30", "x31",
        "fp", "lr", "sp", "pc", "ip0", "ip1", "nzcv",

        // W系列寄存器
        "w0", "w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8", "w9",
        "w10", "w11", "w12", "w13", "w14", "w15", "w16", "w17", "w18", "w19",
        "w20", "w21", "w22", "w23", "w24", "w25", "w26", "w27", "w28", "w29", "w30", "w31",

        // Q系列 NEON 寄存器
        "q0", "q1", "q2", "q3", "q4", "q5", "q6", "q7",
        "q8", "q9", "q10", "q11", "q12", "q13", "q14", "q15",
        "q16", "q17", "q18", "q19", "q20", "q21", "q22", "q23",
        "q24", "q25", "q26", "q27", "q28", "q29", "q30", "q31",

        // D/S 浮点寄存器
        "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
        "d10", "d11", "d12", "d13", "d14", "d15", "d16", "d17", "d18", "d19",
        "d20", "d21", "d22", "d23", "d24", "d25", "d26", "d27", "d28", "d29", "d30", "d31",
        "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9",
        "s10", "s11", "s12", "s13", "s14", "s15", "s16", "s17", "s18", "s19",
        "s20", "s21", "s22", "s23", "s24", "s25", "s26", "s27", "s28", "s29", "s30", "s31",

        // V系列矢量寄存器（与Q重叠，但部分指令使用v命名）
        "v0", "v1", "v2", "v3", "v4", "v5", "v6", "v7",
        "v8", "v9", "v10", "v11", "v12", "v13", "v14", "v15",
        "v16", "v17", "v18", "v19", "v20", "v21", "v22", "v23",
        "v24", "v25", "v26", "v27", "v28", "v29", "v30", "v31"
    ];
}



// 2. 保存寄存器值
function save_regs(context) {
    const regList = getRegisterList();
    regList.forEach(reg => {
        registerValues[reg] = context[reg];
    });
    registerValues['pc'] = context.pc;

    if (context["fp"] !== undefined) {
        registerValues["x29"] = context["fp"];
    }
    if (context["lr"] !== undefined) {
        registerValues["x30"] = context["lr"];
    }
    return Object.assign({}, registerValues); // 防止引用污染
}


// 3. 美化输出工具
function padRight(str, len) {
    str = String(str);
    if (str.length >= len) return str;
    return str + ' '.repeat(len - str.length);
}

// 4. 只提取当前指令中出现的x系列寄存器，只保留不在[]里面的寄存器
function hook_reg(instructionStr) {
    const regList = getRegisterList();
    // 提取所有可能的寄存器名（q12、d31、s0、x5、sp、pc、lr、fp、nzcv、ip0、ip1等）
    const regex = /\b([a-z]{1,4}[0-9]{0,2})\b/gi;
    let match;
    const allRegs = new Set();
    while ((match = regex.exec(instructionStr)) !== null) {
        const reg = match[1].toLowerCase();
        if (regList.includes(reg)) {
            // w系列寄存器全部转为x系列
            if (/^w\d+$/.test(reg)) {
                allRegs.add('x' + reg.slice(1));
            } else {
                allRegs.add(reg);
            }
        }
    }

    // 找出所有在[]里的寄存器（寻址寄存器，不打印）
    const inBracket = new Set();
    const bracketRegex = /\[([^\]]+)\]/g;
    let m;
    while ((m = bracketRegex.exec(instructionStr)) !== null) {
        m[1].replace(/[\[\],!]/g, ' ')
            .split(/\s+/)
            .forEach(word => {
                const reg = word.toLowerCase();
                if (regList.includes(reg)) {
                    if (/^w\d+$/.test(reg)) {
                        inBracket.add('x' + reg.slice(1));
                    } else {
                        inBracket.add(reg);
                    }
                }
            });
    }

    // 只返回不在[]里的寄存器
    return Array.from(allRegs).filter(reg => !inBracket.has(reg));
}



function arrayBufferToHex(buffer) {
    if (!buffer || buffer.byteLength === 0) return "0x0";
    const bytes = new Uint8Array(buffer);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        let h = bytes[i].toString(16).padStart(2, '0');
        hex += h;
    }
    return "0x" + hex;
}

// 5. 根据寄存器名数组取对应的寄存器值（生成格式化字符串）
function get_regvalue(regList, context) {
    let registerValues = '';
    if (regList !== null) {
        regList.forEach(reg => {
            let regVal;
            if (reg.startsWith('w') && context['x' + reg.slice(1)] !== undefined) {
                const xRegName = 'x' + reg.slice(1);
                regVal = context[xRegName];
            }
            else if (reg == "x29") {
                regVal = context.sp;
            }
            else if (reg == "x30") {
                regVal = context["lr"];
            }
            else if (reg.startsWith('q')) {
                try {
                    let v = context[reg];
                    if (v instanceof ArrayBuffer) {
                        regVal = arrayBufferToHex(v);  // 正确转换为hex
                    } else if (v && v.toString) {
                        regVal = v.toString();
                    } else {
                        regVal = JSON.stringify(v);
                    }
                } catch (e) {
                    regVal = 'q-register-error';
                }
            }
            else {
                regVal = context[reg];
            }
            if (regVal !== undefined) {
                registerValues += `${reg}: ${regVal}\t`;
            } else {
                registerValues += `${reg}: Register not found\t`;
            }
        });
    }
    return registerValues;
}



// 6. 根据寄存器名数组，从 prevContext 取值，w系列转x系列
function get_regvalue_from_sp(last_reg, prevContext) {
    let result = '';
    last_reg.forEach(reg => {
        let regVal = prevContext[reg];

        // 如果是 w 寄存器，优先转 x
        if (reg.startsWith('w')) {
            const xRegName = 'x' + reg.slice(1);
            if (prevContext[xRegName] !== undefined) {
                regVal = prevContext[xRegName];
            }
        }

        // 如果是 q 寄存器，转 ArrayBuffer 为 hex
        else if (reg.startsWith('q')) {
            try {
                if (regVal instanceof ArrayBuffer) {
                    regVal = arrayBufferToHex(regVal);  // 使用同一转换函数
                } else if (regVal && regVal.toString) {
                    regVal = regVal.toString();
                } else {
                    regVal = JSON.stringify(regVal);
                }
            } catch (e) {
                regVal = 'q-register-error';
            }
        }

        result += `${reg}: ${regVal}\t`;
    });
    return result;
}


// 7. 对比寄存器值并格式化美观输出
function compare_regvalues(last_regvalue, now_regvalue) {
    let result = '';
    let hasChange = false;

    // 字符串转对象
    function parse_regvalue(regvalue) {
        const regObj = {};
        const regPairs = regvalue.split('\t').map(s => s.trim()).filter(Boolean);
        regPairs.forEach(pair => {
            const idx = pair.indexOf(':');
            if (idx !== -1) {
                const reg = pair.slice(0, idx).trim();
                const val = pair.slice(idx + 1).trim();
                regObj[reg] = val;
            }
        });
        return regObj;
    }

    const lastRegObj = parse_regvalue(last_regvalue);
    const nowRegObj = parse_regvalue(now_regvalue);

    let rows = [];
    for (let reg in lastRegObj) {
        if (nowRegObj[reg] !== undefined) {
            const prevVal = lastRegObj[reg];
            const nowVal = nowRegObj[reg];
            if (prevVal !== nowVal) {
                hasChange = true;
                rows.push(`${reg}: ${prevVal} ==> ${nowVal}`);
            }
        }
    }
    if (hasChange) {
        result = rows.join('\t');  // 变化寄存器直接用tab分隔
    } else {
        // 没有变化就全打印出来，寄存器之间tab分隔
        let unchangedRows = [];
        for (let reg in lastRegObj) {
            unchangedRows.push(`${reg}: ${lastRegObj[reg]}`);
        }
        result = unchangedRows.join('\t');
    }
    return result;
}


// 8. 打印内存变化
function print_memory(instructionStr, context) {
    let output = "";
    const addressRegex = /\[([^\]]+)\]/;
    const match = instructionStr.match(addressRegex);

    if (/str|stur|stp|stxr|stlr|ldur/.test(instructionStr)) {
        return output;
    } else {
        if (match && match[1]) {
            const addressExpression = match[1].trim();
            let addr = null;
            let regName = "", offset = 0;

            // 支持 [reg, #imm] 和 [reg1, reg2] 两种写法
            if (addressExpression.includes(',')) {
                // 拆分成多个部分
                let parts = addressExpression.split(',').map(s => s.trim());
                let regA = parts[0];
                let partB = parts[1];

                // [reg, #imm]，立即数偏移
                if (partB.startsWith('#')) {
                    offset = parseInt(partB.replace('#', ''), 16);
                    // 支持 w寄存器转x寄存器
                    if (regA.startsWith('w')) {
                        regA = 'x' + regA.slice(1);
                    }
                    addr = context[regA].add(offset);
                    regName = regA;
                    output += ` [${regA}+0x${offset.toString(16)}]`;
                }
                // [reg1, reg2]，两个寄存器相加
                else {
                    let regB = partB;
                    if (regA.startsWith('w')) regA = 'x' + regA.slice(1);
                    if (regB.startsWith('w')) regB = 'x' + regB.slice(1);
                    addr = context[regA].add(context[regB]);
                    regName = regA + '+' + regB;
                    output += ` [${regA}+${regB}]`;
                }
            } else {
                // 只有一个寄存器
                regName = addressExpression;
                if (regName.startsWith('w')) regName = 'x' + regName.slice(1);
                addr = context[regName];
                output += ` [${regName}]`;
            }

            try {
                const vals = Memory.readU64(addr).toString(16);
                output += ` ==> ${vals}`;
            } catch (e) {
                output += ` Error reading memory at address: ${addr}`;
            }
        }
    }
    return output;
}


// 9. 主追踪函数
function trace(soname, start, size) {
    const bases = Module.findBaseAddress(soname);
    console.log("[*] base", bases);
    const targetAddress = ptr(start);
    const startBase = bases.add(targetAddress);
    let isFirstIn = true;
    let lastcode = null;
    let lastaddr = 0;
    let lastoffset = 0;
    let prevContext = null;
    let lastmemory = null;

    Interceptor.attach(startBase, {
        onEnter: function () {
            const curTid = Process.getCurrentThreadId();
            let last_reg = null;
            console.log('=========================start trace=========================');
            Stalker.follow(curTid, {
                transform: function (iterator) {
                    let instruction = iterator.next();
                    do {
                        const curRealAddr = instruction.address;
                        const instructionStr = instruction.toString();

                        iterator.putCallout(function (context) {
                            let output = '';
                            if (isFirstIn) {
                                isFirstIn = false;
                                prevContext = save_regs(context);
                                lastcode = instructionStr;
                                lastaddr = context.pc.toString(16);
                                lastoffset = context.pc.sub(bases);
                                lastmemory = print_memory(instructionStr, context);


                                let allRegs = getRegisterList();
                                let allRegValue = get_regvalue(allRegs, context);
                                console.log(
                                    `\n[寄存器初始值]\n| ` +
                                    allRegValue
                                );
                                console.log()



                            } else {
                                output = `${padRight(lastaddr, 12)} [${soname} ${padRight(lastoffset, 12)}]: ${padRight(lastcode, 48)}`;

                                last_reg = hook_reg(lastcode);
                                let last_regvalue = get_regvalue_from_sp(last_reg, prevContext);
                                let now_regvalue = get_regvalue(last_reg, context);

                                let tmp_ans = compare_regvalues(last_regvalue, now_regvalue);

                                output += " | " + tmp_ans;
                                output += lastmemory ? (" " + lastmemory) : "";
                                lastmemory = print_memory(instructionStr, context);

                                lastcode = instructionStr;
                                lastaddr = context.pc.toString(16);
                                lastoffset = context.pc.sub(bases);

                                prevContext = save_regs(context);

                                // 输出一整行
                                console.log(output);
                            }
                        });
                        iterator.keep();
                    } while ((instruction = iterator.next()) !== null);
                }
            });
        },
        onLeave: function () {
            console.log("========================= end trace ===========================");
            Stalker.unfollow();
            Stalker.garbageCollect();
        }
    });
}

// ============ 配置目标模块、基址和追踪范围 ===========
var soname = 'libapp.so';
var startaddr = 0x2d8f60;
var size = 0x324;
setTimeout(trace(soname, startaddr, size),1000);


