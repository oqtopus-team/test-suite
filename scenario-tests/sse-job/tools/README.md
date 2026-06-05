### Python files for SSE testing

- sse.py
   Sample circuit with default transpiler (transpiler_info={}).

- sse-without-transpiler.py
   Sample circuit with no transpiler (transpiler_info={"transpiler_lib": None})

- sse-without-transpiler-failed.py
   Sample circuit with no transpiler. This circuit should end in failure due to H and RY gates.

- sse-non-zero-exit.py
   Sample with non-zero exit code.

### Coversion tool

To generate a json and a zip from a Python file for SSE testing, run the following command.

```bash
bash wrap_into_json.sh <Python file name>
```
